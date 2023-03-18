import {
  App,
  aws_autoscaling as asg,
  aws_codedeploy as codedeploy,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elb,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_iam as iam,
  Duration,
  Stack,
  StackProps,
} from 'aws-cdk-lib'
import { RdsPostgres } from './rds-postgres';

export interface SharedVpcAlbProps extends StackProps {
  vpc: ec2.Vpc,
}
export class SharedVpcAlbStack extends Stack {
  constructor(scope: App, id: string, props: SharedVpcAlbProps) {
    super(scope, id, props);

    const rdsPostgres = new RdsPostgres(this, 'CdkRds', {vpc: props.vpc})

    // TODO --- Construct で切り出し --- //
    /* ALB, Listener, TargetGroup */
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      // インバウンドルールは ALB のリスナーを作成すると自動生成されるのでここでは設定しない
      securityGroupName: 'DemoAlbSg',
      vpc: props.vpc,
    });

    const alb = new elb.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: "DemoAlb",
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({subnetGroupName: 'public'}),
      internetFacing: true,
      securityGroup: albSg
    });

    // Listener はデフォルトで EC2(RDSへ接続)、クエリパラメーターで EC2+ASG や ECS(ローリングデプロイ)のターゲットへ振り分け
    const albListener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      open: true,
    });

    const targetGroupEc2Rds = albListener.addTargets('ec2-rds', {
      targetGroupName: "demoEc2-rds",
      port: 8000,
      targets: [],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // 起動テンプレート
    const userDataForEc2Rds = ec2.UserData.forLinux();
    // 本来は必要なパッケージをインストールしたAMIを利用すべき
    // TODO コードが長くなるしメンテもしづらいので、シェルスクリプトをダウンロードして実行するようにしたいかも
    userDataForEc2Rds.addCommands(
      "yum update -y",
      "yum install git gcc -y",
      "amazon-linux-extras install python3.8 postgresql12 -y",
      "ln -fs /usr/bin/python3.8 /usr/bin/python3",
      "",
      "sudo -u ec2-user python3 -m pip install pip --upgrade",
      "sudo -u ec2-user python3 -m pip install wheel fastapi uvicorn[standard] boto3 Jinja2 sqlalchemy psycopg2-binary python-multipart",
      "",
      "sudo -u ec2-user git clone https://github.com/sugikeitter/FastApi-Jinja-SQLAlchemy.git /home/ec2-user/FastApi-Jinja-SQLAlchemy/",
      "sudo -u ec2-user mkdir /home/ec2-user/log",
      "",
      "# setting systemd",
      "cat <<EOF > /etc/systemd/system/fastapi.service",
      "[Unit]",
      "Description=fastapi",
      "After=network-online.target",
      "",
      "[Service]",
      "EnvironmentFile=/etc/sysconfig/fastapi_env",
      "User=ec2-user",
      "Group=ec2-user",
      "WorkingDirectory=/home/ec2-user/FastApi-Jinja-SQLAlchemy",
      "ExecStart=/bin/python3 -m uvicorn main:app --host 0.0.0.0",
      "ExecStop=/bin/kill -s TERM $MAINPID",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "EOF",
      "",
      "# TODO replace $YOUR_PARAM",
      "cat <<EOF > /etc/sysconfig/fastapi_env",
      "RDS_SECRET_ID='" + rdsPostgres.dbInstancePostgres?.secret?.secretName + "'",
      "EOF",
      "",
      "systemctl start fastapi",
    );
    // Secrets Manager へアクセスするポリシーを追加したロール
    const roleEc2Rds = new iam.Role(this, 'SsmRoleForEc2Rds', {
      roleName: 'SsmRoleForEc2RdsSecrets',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMPatchAssociation'),
      ],
      inlinePolicies: {
        'GetSecretValue': iam.PolicyDocument.fromJson({
          "Version": "2012-10-17",
          "Statement": [
            {
              "Sid": "secretsmanager",
              "Effect": "Allow",
              "Action": "secretsmanager:GetSecretValue",
              "Resource": [
                  rdsPostgres.dbInstancePostgres?.secret?.secretArn,
              ]
            }
          ]
        })
      },
    });

    // ALBからのみアクセスを受けるEC2のSG
    const ec2SgForEc2Rds = new ec2.SecurityGroup(this, 'port8000FromPublicSubnet', {
      vpc: props.vpc,
    });
    // ALB→NWFW→EC2のサブネットを経由している場合、EC2のSGにALBのSGを指定してもヘルスチェックが到達しないため、IPでIngressRuleを指定する
    props.vpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach(subnet => {
      ec2SgForEc2Rds.addIngressRule(ec2.Peer.ipv4(subnet.ipv4CidrBlock), ec2.Port.tcp(8000));
    });
    const launchTemplateForEc2Rds = new ec2.LaunchTemplate(this, 'FastApiJinjaSqlAlchemy', {
      launchTemplateName: "fastapi-jinja-sqlalchemy",
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      userData: userDataForEc2Rds,
      // constructor では SG の複数設定はできないので、後ほど connections を利用して DB へアクセスできる SG を追加
      securityGroup: ec2SgForEc2Rds,
      role: roleEc2Rds,
    });
    launchTemplateForEc2Rds.connections.addSecurityGroup(rdsPostgres.dbClientSg);

    // AutoScaling Group(`launcTemplate:` を変数で用意しなくてもASGのプロパティ指定でlaunchTemplateも作成してくれるが、分割した方が今後拡張しやすそうなので)
    const asgForEc2Rds = new asg.AutoScalingGroup(this, 'AsgRds', {
      vpc: props.vpc,
      autoScalingGroupName: "ec2-rds",
      healthCheck: asg.HealthCheck.elb({
        grace: Duration.seconds(300) // ここの数値はもう少し減らしても良いかも
      }),
      // desiredCapacity: 1, // CDK-LOG: desiredCapacity has been configured. Be aware this will reset the size of your AutoScalingGroup on every deployment. See https://github.com/aws/aws-cdk/issues/5215
      minCapacity: 0,
      maxCapacity: 3,
      launchTemplate: launchTemplateForEc2Rds,
      vpcSubnets: props.vpc.selectSubnets({subnetGroupName: 'privateA'}),
    });
    asgForEc2Rds.attachToApplicationTargetGroup(targetGroupEc2Rds);

    // クエリパラメーター(tg=ec2-asg)
    const targetGroupEc2Asg = albListener.addTargets('TgEc2Asg', {
      targetGroupName: "demoEc2-asg",
      port: 80,
      targets: [],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      },
      conditions: [
        elb.ListenerCondition.queryStrings([
          {key: "tg", value: "ec2-asg"}
        ])
      ],
      priority: 1
    });

    // クエリパラメーター(tg=ecs)
    // ECS(ローリングデプロイ)用
    const targetGroup = albListener.addTargets('TgEcs', {
      targetGroupName: "demoEcs",
      port: 80,
      targets: [],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      },
      conditions: [
        elb.ListenerCondition.queryStrings([
          {key: "tg", value: "ecs"}
        ])
      ],
      priority: 2
    });
    // `albListener.addTargets`の場合、targetTypeが指定できず"instance"になるが、ECSの場合は"ip"にしたい
    // もしかしたら`albListener.addTargets` 使わず `new elb.CfnTargetGroup` 使った方が良いかも？
    const cfnTargetGroup = targetGroup.node.children.find(
       // `console.error(targetGroup.node.children)`で中を見たところ、id が 'Resource'のnodeしか存在しなかったのでひとまず
      (child) => child.node.id == 'Resource'
    ) as elb.CfnTargetGroup ;
    cfnTargetGroup.targetType = 'ip';

    /* targeType を IP に指定する場合はこっちの方が楽かも？修正できるか検討中 */
    // const tgEcs = new elb.ApplicationTargetGroup(this, 'TgEcs', {
    //   targetGroupName: "demoEcs-albDefault",
    //   vpc: props.vpc,
    //   targetType: elb.TargetType.IP,
    //   port: 80,
    //   targets: [],
    //   // healthCheck: { // albListener.addTargets で設定しないといけないっぽい
    //   //   path: "/health",
    //   //   healthyThresholdCount: 2,
    //   //   unhealthyThresholdCount: 3
    //   // },
    // });
    // albListener.addTargets('ecs', {
    //   targetGroupName: tgEcs.targetGroupName,
    //   healthCheck: {
    //     path: "/health",
    //     healthyThresholdCount: 2,
    //     unhealthyThresholdCount: 3
    //   },
    // });

    /* EC2+ASG */
    // ALBからのみアクセスを受けるEC2のSG
    const ec2Sg = new ec2.SecurityGroup(this, 'Ec2FromPublicSubnet', {
      vpc: props.vpc,
    });
    // ALB→NWFW→EC2のサブネットを経由している場合、以下のような EC2 の SG に ALB の SG を指定してもヘルスチェックが到達しないので注意
    // ec2Sg.addIngressRule(albSg, ec2.Port.tcp(80));
    // EC2 の SG には ALB があるサブネットの IP CIDR の指定が必要（もしくは NWFW エンドポイントの ENI にSG設定する）
    // MEMO: SharedVPCのパブリックサブネットにALBを作成し、そのALB経由のIngressのトラフィックにNWFWはしない方が良いのか？
    // MEMO: ALBはTGWでSharedVPCに接続できる別のVPCにパブリックサブネット(NATGWはなし)を用意して、そのVPCでALB→EC2を用意すべき？
    props.vpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach(subnet => {
      ec2Sg.addIngressRule(ec2.Peer.ipv4(subnet.ipv4CidrBlock), ec2.Port.tcp(80));
    });

    /* EC2 Only Server */
    // 起動テンプレート
    const userData = ec2.UserData.forLinux();
    // 本来は必要なパッケージをインストールしたAMIを利用すべき
    userData.addCommands(
      "sudo -u ec2-user sh -c \"curl https://raw.githubusercontent.com/sugikeitter/golang__http-server-on-aws/main/bin/go-http-linux > /home/ec2-user/httpServer\"",
      "sudo -u ec2-user chmod 755 /home/ec2-user/httpServer",
      "nohup sudo /home/ec2-user/httpServer 80 &"
    );
    // 変更してもデフォルトversionは最新に変わらないので注意、AutoScalingGroupのコンストラクタのプロパティに渡した場合は、最新Ver.をASGが指定してくれるようにはなっている
    const launchTemplate = new ec2.LaunchTemplate(this, 'SimpleHttpServer', {
      launchTemplateName: "http-server-on-aws",
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      userData: userData,
      securityGroup: ec2Sg,
      role: iam.Role.fromRoleName(this, 'SsmRoleForEc2', 'AmazonSSMRoleForInstancesQuickSetup'),
    });

    // AutoScaling Group(launcTemplateの変数を用意しなくてもASGのプロパティ指定でlaunchTemplateも作成してくれるが、分割した方が今後拡張しやすそうなので)
    const ec2Asg = new asg.AutoScalingGroup(this, 'Asg', {
      vpc: props.vpc,
      autoScalingGroupName: "go-http",
      healthCheck: asg.HealthCheck.elb({
        grace: Duration.seconds(30)
      }),
      // desiredCapacity: 1, // desiredCapacity has been configured. Be aware this will reset the size of your AutoScalingGroup on every deployment. See https://github.com/aws/aws-cdk/issues/5215
      minCapacity: 0,
      maxCapacity: 3,
      launchTemplate: launchTemplate,
      vpcSubnets: props.vpc.selectSubnets({subnetGroupName: 'privateA'})
    });
    ec2Asg.attachToApplicationTargetGroup(targetGroupEc2Asg);
    ec2Asg.scaleOnRequestCount('100reqPerMinutes', {
      targetRequestsPerMinute: 100
    });


    // TODO --- Construct に切り出し ----
    /* ECS with Blue/Green Deployment */
    // ALBからのみアクセスを受けるECSのSG
    const ecsBgAlbSg = new ec2.SecurityGroup(this, 'EcsBgAlbSg', {
      // インバウンドルールは ALB のリスナーを作成すると自動生成されるのでここでは設定しない
      securityGroupName: 'DemoAlbEcsBgSg',
      vpc: props.vpc,
    });
    // ECS B/G 用の ALB
    const albEcsBg = new elb.ApplicationLoadBalancer(this, 'AlbEcsBg', {
      loadBalancerName: "DemoAlbEcsBg",
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({subnetGroupName: 'public'}),
      internetFacing: true,
      securityGroup: ecsBgAlbSg // TODO B/G 用のテストリスナーで空けている9000番ポートは、社内など特定の IP からのみに制限した方が良さそう
    });

    // L2 Construct で CodeDeploy の B/G を使用する場合、DeploymentGroup 作成時に ECS Service を CDK で定義しないといけない
    const ecsCluster = new ecs.Cluster(this, 'EcsCluster', {
      clusterName: "DemoFargate",
      vpc: props.vpc
    });

    const taskDefForBg = new ecs.FargateTaskDefinition(this, 'TaskDefForBg', {
      family: 'TaskDefFamilyForBg',
      cpu: 256,
      memoryLimitMiB: 512,
    });
    const ecrRepo = ecr.Repository.fromRepositoryName(this, 'GolangDemoHttpRepo', 'golang-demo-http-server-on-aws')
    const latestImage = ecs.ContainerImage.fromEcrRepository(
      ecrRepo,
      'latest'
    );
    taskDefForBg.addContainer('DefaultContainer', {
      containerName: 'http-on-aws',
      // image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      image: latestImage,
      memoryLimitMiB: 512,
      portMappings: [
        {hostPort: 80, containerPort: 80}
      ],
      environment: {
        "H3_COLOR": "33, 119, 218" // 青色
      }
    });
    // TODO B/G 切り替えをするために、タスク定義のリビジョンをもう一つ作っておく
    const taskDefForBgForGreen = new ecs.FargateTaskDefinition(this, 'TaskDefForBgForGreen', {
      family: 'TaskDefFamilyForBg',
      cpu: 256,
      memoryLimitMiB: 512,
    });
    taskDefForBgForGreen.addContainer('DefaultContainerForGreen', {
      containerName: 'http-on-aws',
      // image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      image: latestImage,
      memoryLimitMiB: 512,
      portMappings: [
        {hostPort: 80, containerPort: 80}
      ],
      environment: {
        "H3_COLOR": "63, 177, 12" // 緑色
      }
    });

    // ALBからのみアクセスを受けるECSのSG
    const ecsSvcBgSg = new ec2.SecurityGroup(this, 'EcsSvcBgSg', {
      // インバウンドルールには NWFW サブネットを経由して IP の範囲を指定したルールにしたいためここでは定義せず、すぐ下で追加設定する
      securityGroupName: 'DemoEcsSvcBgSg',
      vpc: props.vpc,
    });
    // ALB→NWFW→EC2のサブネットを経由している場合、ECSのSGにALBのSGを指定してもヘルスチェックが到達しないため、IPでIngressRuleを指定する
    props.vpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach(subnet => {
      ecsSvcBgSg.addIngressRule(ec2.Peer.ipv4(subnet.ipv4CidrBlock), ec2.Port.tcp(80));
    });

    // Instantiate an Amazon ECS Service
    const ecsService = new ecs.FargateService(this, 'EcsFargateBg', {
      serviceName: 'demoEcsFargateBg',
      cluster: ecsCluster,
      taskDefinition: taskDefForBg,
      vpcSubnets: props.vpc.selectSubnets({ subnetGroupName: 'privateA' }),
      securityGroups:[ecsSvcBgSg],
      deploymentController: { type: ecs.DeploymentControllerType.CODE_DEPLOY }
    });

    const albListenerForEcsBg1 = albEcsBg.addListener('HttpListenerEcsBg1', {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      open: true,
      defaultAction: elb.ListenerAction.weightedForward([

      ])
    });

    const targetGroupEcsBg1 = albListenerForEcsBg1.addTargets('ecs-bg-1', {
      targetGroupName: "demoEcs-bg-1",
      port: 80,
      targets: [ecsService],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      },
    });

    // ECS(Blue/Green) で Listener を2つ使用
    //  Listener を1つ使用する場合は、albListenerForEcsBg1.addAction() を使えばできる？検証できていない
    const albListenerForEcsBg2 = albEcsBg.addListener('HttpListenerEcsBg2', {
      port: 9000,
      protocol: elb.ApplicationProtocol.HTTP,
      open: false, // B/G 用のテストリスナーで空けている9000番ポートは、社内など特定の IP からのみに制限したいため
    });
    const targetGroupEcsBg2 = albListenerForEcsBg2.addTargets('ecs-bg-2', {
      targetGroupName: "demoEcs-bg-2",
      port: 80,
      targets: [ecsService],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      }
    });

    // ECS B/G 用の CodeDeploy リソース作成
    const codedeployEcsBgApp = new codedeploy.EcsApplication(this, 'EcsBgDeployApp', {
      applicationName: 'DemoEcsBg',
    });
    new codedeploy.EcsDeploymentGroup(this, 'L2EcsBgDg', {
      application: codedeployEcsBgApp, // 指定しない場合は自動で作成してくれる
      service: ecsService,
      blueGreenDeploymentConfig: {
        blueTargetGroup: targetGroupEcsBg1,
        greenTargetGroup: targetGroupEcsBg2,
        listener: albListenerForEcsBg1,
        testListener: albListenerForEcsBg2
      }
    });

    // // TODO testListenerを使用しない時はリスナー同じでどうやる？を確認する weight の設定を使用してやるっぽい https://github.com/sabarnac/cdk-sample-alb-weighted-target-group/blob/99e1435e417b56ab0e00b43f97cdff8fb73d4020/lib/foobar-stack.ts#L60-L90
    // const albListenerForEcsBg = albEcsBg.addListener('HttpListenerEcsBg', {
    //   port: 80,
    //   protocol: elb.ApplicationProtocol.HTTP,
    //   open: true,
    //   defaultAction: elb.ListenerAction.weightedForward([
    //     {
    //       weight: 100,
    //       targetGroup: new elb.ApplicationTargetGroup(this, "TgEcsBg1", {
    //         targetGroupName: "demoEcs-bg-1",
    //         port: 80,
    //         targets: [ecsService],
    //         healthCheck: {
    //           path: "/health",
    //           healthyThresholdCount: 2,
    //           unhealthyThresholdCount: 3
    //         }
    //       })
    //     },
    //     {
    //       weight: 0,
    //       targetGroup: new elb.ApplicationTargetGroup(this, "TgEcsBg2", {
    //         targetGroupName: "demoEcs-bg-2",
    //         port: 80,
    //         targets: [ecsService],
    //         healthCheck: {
    //           path: "/health",
    //           healthyThresholdCount: 2,
    //           unhealthyThresholdCount: 3
    //         }
    //       })
    //     }
    //   ])
    // });

/* L1 Construct
    const cfnEcsBgDeploymentGroup = new codedeploy.CfnDeploymentGroup(this, 'EcsBgDg' {
      applicationName: 'DemoEcsBg',
      serviceRoleArn: '',
    });
    const ecsBgDeploymentGroup = codedeploy.EcsDeploymentGroup.fromEcsDeploymentGroupAttributes(this, 'EcsBgDg', {
      deploymentGroupName: 'EcsBgDeploymentGroup',
      deploymentConfig: codedeploy.EcsDeploymentConfig.ALL_AT_ONCE
    });
 */






    // ECS（ローリングデプロイ）用のタスク実行ロール
    const ecsExecRole = new iam.Role(this, 'EcsTaskExecRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")
      ]
    });
    /* TODO ECS の CI/CD で疎結合にするならここから下は切り出したほうが良さそう？悩ましいところ */
    // const taskDef = new ecs.TaskDefinition(this, 'EcsTaskDef', {
    //   memoryMiB: '512',
    //   cpu: '256',
    //   compatibility: ecs.Compatibility.FARGATE,
    //   executionRole: ecsExecRole,
    // });

    // taskDef.addContainer('demoGolangHttpServer', {
    //   image: ecs.ContainerImage.fromRegistry(
    //     // 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/image-name:tag
    //     process.env.AWS_ACCOUNT_ID + '.dkr.ecr.' + process.env.AWS_REGION || "ap-northeast-1" + '.amazonaws.com/'
    //     + process.env.IMAGE_NAME + ':' + process.env.IMAGE_TAG || 'latest'), // TODO CI/CDの場合、ここのタグをデプロイしたいもので渡す
    //   memoryLimitMiB: 256,
    //   portMappings: [
    //     {hostPort: 80, containerPort: 80}
    //   ]
    // });

    // // TODO 設定値の確認
    // new ecs.FargateService(this, 'EcsFargateSvc', {
    //   cluster: ecsCluster,
    //   taskDefinition: taskDef,
    //   vpcSubnets: props.vpc.selectSubnets({subnetGroupName: 'privateA'})
    // });
  }
}
