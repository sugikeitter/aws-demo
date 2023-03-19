import {
  aws_certificatemanager as acm,
  aws_codedeploy as codedeploy,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_elasticloadbalancingv2 as elb,
  aws_iam as iam,
  aws_ssm as ssm,
  aws_route53 as r53,
  aws_route53_targets as r53tartet,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface AlbEcsProps {
  vpc: ec2.Vpc;
}

export class AlbEcs extends Construct {
  constructor(scope: Construct, id: string, props: AlbEcsProps) {
    super(scope, id)

    // ALBからのみアクセスを受けるECSのSG
    const ecsBgAlbSg = new ec2.SecurityGroup(this, 'EcsBgAlbSg', {
      // インバウンドルールは ALB のリスナーを作成すると自動生成されるのでここでは設定しない
      // securityGroupName: 'DemoAlbEcsBgSg',
      vpc: props.vpc,
    });
    // ECS B/G 用の ALB
    const albEcs = new elb.ApplicationLoadBalancer(this, 'Alb', {
      // loadBalancerName: "DemoAlbEcs",
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({subnetGroupName: 'public'}),
      internetFacing: true,
      securityGroup: ecsBgAlbSg // TODO B/G 用のテストリスナーで空けている9000番ポートは、社内など特定の IP からのみに制限した方が良さそう
    });

    // L2 Construct で CodeDeploy の B/G を使用する場合、DeploymentGroup 作成時に ECS Service を CDK で定義しないといけない
    const ecsCluster = new ecs.Cluster(this, 'FargateCl', {
      // clusterName: "DemoFargate",
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
    taskDefForBg.addContainer('HttpBlue', {
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
    taskDefForBgForGreen.addContainer('HttpGreen', {
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
      // securityGroupName: 'DemoEcsSvcBgSg',
      vpc: props.vpc,
    });
    // ALB→NWFW→EC2のサブネットを経由している場合、ECSのSGにALBのSGを指定してもヘルスチェックが到達しないため、IPでIngressRuleを指定する
    props.vpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach(subnet => {
      ecsSvcBgSg.addIngressRule(ec2.Peer.ipv4(subnet.ipv4CidrBlock), ec2.Port.tcp(80));
    });

    // Instantiate an Amazon ECS Service
    const ecsService = new ecs.FargateService(this, 'EcsFargateBg', {
      // serviceName: 'demoEcsFargateBg',
      cluster: ecsCluster,
      taskDefinition: taskDefForBg,
      vpcSubnets: props.vpc.selectSubnets({ subnetGroupName: 'privateA' }),
      securityGroups:[ecsSvcBgSg],
      deploymentController: { type: ecs.DeploymentControllerType.CODE_DEPLOY }
    });

    const albListenerForEcsBg1 = albEcs.addListener('HttpListenerEcsBg1', {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      open: true,
    });

    const targetGroupEcsBg1 = albListenerForEcsBg1.addTargets('ecs-bg-1', {
      // targetGroupName: "demoEcs-bg-1",
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
    const albListenerForEcsBg2 = albEcs.addListener('HttpListenerEcsBg2', {
      port: 9000,
      protocol: elb.ApplicationProtocol.HTTP,
      open: false, // B/G 用のテストリスナーで空けている9000番ポートは、社内など特定の IP からのみに制限したいため
    });
    const targetGroupEcsBg2 = albListenerForEcsBg2.addTargets('ecs-bg-2', {
      // targetGroupName: "demoEcs-bg-2",
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
      // applicationName: 'DemoEcsBg',
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
    /*
    ```yaml:appspec-sample
    version: 0.0
    Resources:
      - TargetService:
          Type: AWS::ECS::Service
          Properties:
            TaskDefinition: "arn:aws:ecs:region:{aws_account_id}:task-definition/{task-definition-name}:{revision_number}"
            LoadBalancerInfo:
              ContainerName: "sample-app"
              ContainerPort: 80
            PlatformVersion: "LATEST"
    ```
    */

    // ECS(ローリングデプロイ)のアプリ: クエリパラメーター(tg=ecs-rolling)
    // targetType: IP でターゲットが0のターゲットグループを作成する場合、albListener.addTargets では指定できないため
    const tgDemoEcsR = new elb.ApplicationTargetGroup(this, 'TgpEcsR', {
      // targetGroupName: "demoEcsR",
      vpc: props.vpc,
      port: 80,
      targets: [],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      },
      targetType: elb.TargetType.IP,
    });
    const albListenerForEcsR = albEcs.addListener('HttpsListenerEcsR', {
      port: 443,
      protocol: elb.ApplicationProtocol.HTTPS,
      open: true,
      certificates: [
          elb.ListenerCertificate.fromArn(
            // TODO ACM を用意して SSM にパラメータ登録が事前に必要
            ssm.StringParameter.valueForStringParameter(this, '/cdk/demo/ecsapp/acmarnForAlb'))
      ]
    });
    // TODO Route 53 にレコード作成（設定途中）
    // new r53.ARecord(this, 'RollingA', {
    //   target: r53.RecordTarget.fromAlias(new r53tartet.LoadBalancerTarget(albEcs)),
    //   // TODO R53 ホストゾーンを用意して SSM にパラメータ登録が事前に必要
    //   zone: r53.HostedZone.fromHostedZoneId(this, 'hostedZone',
    //     ssm.StringParameter.valueForStringParameter(this, '/cdk/demo/ecsapp/hostedZoneId'))
    // });

    albListenerForEcsR.addTargetGroups('TgEcsR', {
      targetGroups: [
        tgDemoEcsR
      ],
      // conditions: [
      //   elb.ListenerCondition.queryStrings([
      //     {key: "tg", value: "ecs-rolling"}
      //   ])
      // ],
      // priority: 2
    });
    /* ECS（ローリングアップデート）アプリ : ECS サービス・ECS タスク定義の CI/CD は別で定義するので、それ以外に必要なものだけ */
    // ALBからのみアクセスを受けるEC2のSG
    const ecsTaskSg = new ec2.SecurityGroup(this, 'port80FromAlbSubnet', {
      vpc: props.vpc,
    });
    // ALB→NWFW→ECSのサブネットを経由している場合、EC2のSGにALBのSGを指定してもヘルスチェックが到達しないため、IPでIngressRuleを指定する
    props.vpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach(subnet => {
      ecsTaskSg.addIngressRule(ec2.Peer.ipv4(subnet.ipv4CidrBlock), ec2.Port.tcp(80));
    });

    // ECS（ローリングデプロイ）用のタスク実行ロール
    const ecsExecRole = new iam.Role(this, 'EcsTaskExecRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")
      ]
    });

    // ECS（ローリングデプロイ）用のタスクロール: ecs-exec が使用できるようにしておく
    const ecsTaskRole = new iam.Role(this, 'EcsTaskRoleForExec', {
      // roleName: 'EcsTaskRoleForExec',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        'GetSecretValue': iam.PolicyDocument.fromJson({
          "Version": "2012-10-17",
          "Statement": [
            {
              "Sid": "secretsmanager",
              "Effect": "Allow",
              "Action": [
                "ssmmessages:CreateControlChannel",
                "ssmmessages:CreateDataChannel",
                "ssmmessages:OpenControlChannel",
                "ssmmessages:OpenDataChannel"
              ],
              "Resource": "*"
            }
          ]
        })
      },
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
    // new ecs.FargateService(this, 'EcsFargateSvc', {
    //   cluster: ecsCluster,
    //   taskDefinition: taskDef,
    //   vpcSubnets: props.vpc.selectSubnets({subnetGroupName: 'privateA'})
    // });



    // // TODO testListenerを使用しない時はリスナー同じでどうやる？を確認する
    // 単体でターゲットグループを作成しておけば良さそう
    // +α weight の設定を使用してみる例（参考: https://github.com/sabarnac/cdk-sample-alb-weighted-target-group/blob/99e1435e417b56ab0e00b43f97cdff8fb73d4020/lib/foobar-stack.ts#L60-L90
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

/* ECS の CI/CD パイプライン のライフサイクルを CDK から切り離したい場合、L1 Construct で CodeDeploy リソースだけ定義したい
    const cfnEcsBgDeploymentGroup = new codedeploy.CfnDeploymentGroup(this, 'EcsBgDg' {
      applicationName: 'DemoEcsBg',
      serviceRoleArn: '',
    });
    const ecsBgDeploymentGroup = codedeploy.EcsDeploymentGroup.fromEcsDeploymentGroupAttributes(this, 'EcsBgDg', {
      deploymentGroupName: 'EcsBgDeploymentGroup',
      deploymentConfig: codedeploy.EcsDeploymentConfig.ALL_AT_ONCE
    });
*/

  }
}