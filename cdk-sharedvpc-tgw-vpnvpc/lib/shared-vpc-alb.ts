import {
  aws_autoscaling as asg,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elb,
  aws_ecs as ecs,
  aws_iam as iam,
  Duration,
} from 'aws-cdk-lib'
import { Construct } from 'constructs';

export interface SharedVpcAlbProps {
  vpc: ec2.Vpc,
}
export class SharedVpcAlb extends Construct {
  constructor(scope: Construct, id: string, props: SharedVpcAlbProps) {
    super(scope, id);

    /* ALB, Listener, TargetGroup */
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: props.vpc,
    }); // ルールはALBのリスナーを作成すると自動生成されるのでここでは設定しない
    const albSubnets: ec2.SubnetSelection = {
      subnetType: ec2.SubnetType.PUBLIC,
    };
    const alb = new elb.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: "DemoAlb",
      vpc: props.vpc,
      vpcSubnets: albSubnets,
      internetFacing: true,
      securityGroup: albSg
    });

    // ListenerはデフォルトでECS(ローリングデプロイ)、クエリパラメーターでEC2+ASGやECS(Blue/Green)のターゲットへ振り分け
    const albListener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      open: true,
    });

    // ECS(ローリングデプロイ)用
    const targetGroup = albListener.addTargets('ecs', {
      targetGroupName: "demoEcs",
      port: 80,
      targets: [],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      }
    });
    // `albListener.addTargets`の場合、targetTypeが指定できず"instance"になるが、ECSの場合は"ip"にしたい
    // もしかしたら`albListener.addTargets` 使わず `new elb.CfnTargetGroup` 使った方が良いかも？
    const cfnTargetGroup = targetGroup.node.children.find(
       // `console.error(targetGroup.node.children)`で中を見たところ、id が 'Resource'のnodeしか存在しなかったのでひとまず
      (child) => child.node.id == 'Resource'
    ) as elb.CfnTargetGroup ;
    cfnTargetGroup.targetType = 'ip';

    // クエリパラメーター(tg=ec2-asg)
    const targetGroupEc2Asg = albListener.addTargets('ec2-asg', {
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

    // クエリパラメーター(tg=ecs-bg)
    const targetGroupEcsBg1 = albListener.addTargets('ecs-bg-1', {
      targetGroupName: "demoEcs-bg-1",
      port: 80,
      targets: [],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      },
      conditions: [
        elb.ListenerCondition.queryStrings([
          {key: "tg", value: "ecs-bg"}
        ])
      ],
      priority: 2
    });
    const cfnTargetGroupEcsBg1 = targetGroupEcsBg1.node.children.find(
      // `console.error(targetGroup.node.children)`で中を見たところ、id が 'Resource'のnodeしか存在しなかったのでひとまず
      (child) => child.node.id == 'Resource'
    ) as elb.CfnTargetGroup ;
    cfnTargetGroupEcsBg1.targetType = 'ip';

    // ECS(Blue/Green)はListenerが2つ必要
    const albListenerEcsBg = alb.addListener('HttpListenerEcsBg', {
      port: 9000,
      protocol: elb.ApplicationProtocol.HTTP,
      open: true,
    });

    const targetGroupEcsBg2 = albListenerEcsBg.addTargets('ecs-bg-2', {
      targetGroupName: "demoEcs-bg-2",
      port: 80,
      targets: [],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      },
      // * ポート9000で受け付けるターゲットは1つしかないのでconditionsは不要
      // conditions: [
      //   elb.ListenerCondition.queryStrings([
      //     {key: "tg", value: "ecs-bg"}
      //   ])
      // ]
    });
    const cfnTargetGroupEcsBg2 = targetGroupEcsBg2.node.children.find(
      // `console.error(targetGroup.node.children)`で中を見たところ、id が 'Resource'のnodeしか存在しなかったのでひとまず
      (child) => child.node.id == 'Resource'
    ) as elb.CfnTargetGroup ;
    cfnTargetGroupEcsBg2.targetType = 'ip';

    /* EC2+ASG */
    // ALBからのみアクセスを受けるEC2のSG
    const ec2Sg = new ec2.SecurityGroup(this, 'Ec2FromPublicSubnet', {
      vpc: props.vpc,
    });
    // TODO ALB→NWFW→EC2のサブネットを経由している場合、EC2のSGにALBのSGを指定してもヘルスチェックが到達しない
    // ec2Sg.addIngressRule(albSg, ec2.Port.tcp(80));

    // TODO とりあえずEC2のSGにはALBのサブネットのIP CIDR指定が必要(もしくはNWFWエンドポイントのENIにSG設定する)
    //  SharedVPCのパブリックサブネットにALBを作成し、そのALB経由のIngressのトラフィックにNWFWはしない方が良いのか？
    //  ALBはTGWでSharedVPCに接続できる別のVPCにパブリックサブネット(NATGWはなし)を用意して、そのVPCでALB→EC2を用意すべき？
    props.vpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach(subnet => {
      ec2Sg.addIngressRule(ec2.Peer.ipv4(subnet.ipv4CidrBlock), ec2.Port.tcp(80));
    });

    // 起動テンプレート
    const userData = ec2.UserData.forLinux();
    // 本来は必要なパッケージをインストールしたAMIを利用すべき
    userData.addCommands(
      "sudo -u ec2-user sh -c \"curl https://raw.githubusercontent.com/sugikeitter/golang__htmlServerOnAws/main/bin/go-http-linux > /home/ec2-user/httpServer\"",
      "sudo -u ec2-user chmod 755 /home/ec2-user/httpServer",
      "nohup sudo /home/ec2-user/httpServer 80 &"
    );
    const launchTemplate = new ec2.LaunchTemplate(this, 'AmznLinux2', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      userData: userData,
      securityGroup: ec2Sg,
      role: iam.Role.fromRoleName(this, 'SsmRoleForEc2', 'AmazonSSMRoleForInstancesQuickSetup'),
    })

    // AutoScaling Group(launcTemplateの変数を用意しなくてもASGのプロパティ指定でlaunchTemplateも作成してくれるが、分割した方が今後拡張しやすそうなので)
    const ec2Asg = new asg.AutoScalingGroup(this, 'Asg', {
      vpc: props.vpc,
      autoScalingGroupName: "go-http",
      // desiredCapacity: 1, // desiredCapacity has been configured. Be aware this will reset the size of your AutoScalingGroup on every deployment. See https://github.com/aws/aws-cdk/issues/5215
      healthCheck: asg.HealthCheck.elb({
        grace: Duration.seconds(30)
      }),
      maxCapacity: 3,
      minCapacity: 1,
      launchTemplate: launchTemplate,
      vpcSubnets: props.vpc.selectSubnets({subnetGroupName: 'privateA'})
    });
    ec2Asg.attachToApplicationTargetGroup(targetGroupEc2Asg);
    ec2Asg.scaleOnRequestCount('300reqPerMinutes', {
      targetRequestsPerMinute: 300
    });

    /* ECSクラスタとタスク実行ロールのみ用意 */
    /* タスク定義はコンテナイメージpushトリガーにCI/CDしたいので、タスク定義に紐づくECSサービスもここでは作成しない */
    const ecsCluster = new ecs.Cluster(this, 'EcsCluster', {
      clusterName: "DemoFargate",
      vpc: props.vpc
    });

    const ecsExecRole = new iam.Role(this, 'EcsTaskExecRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")
      ]
    });

    /* TODO ここから下は、CI/CDで疎結合にするなら切り出したほうが良さそう？悩ましいところ */
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