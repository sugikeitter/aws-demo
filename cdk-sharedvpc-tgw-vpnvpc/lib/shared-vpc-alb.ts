import {
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elb,
  aws_ecs as ecs,
  aws_iam as iam,
} from 'aws-cdk-lib'
import { Construct } from 'constructs';

export interface SharedVpcAlbProps {
  vpc: ec2.Vpc,
}
export class SharedVpcAlb extends Construct {
  constructor(scope: Construct, id: string, props: SharedVpcAlbProps) {
    super(scope, id);
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

    const albListener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      open: true,
    });

    const targetGroup = albListener.addTargets('ecs', {
      targetGroupName: "ecs",
      port: 80,
      targets: [],
      healthCheck: {
        path: "/health"
      }
    });
    // `albListener.addTargets` 使わず `new elb.CfnTargetGroup` 使った方が良いかも？
    const cfnTargetGroup = targetGroup.node.children.find(
       // TODO id が 'Resource' でTargetGroupが取得できる理由が謎だが、console.error(targetGroup.node.children)で中を見たところ、このnodeしか存在しなかったのでひとまず
      (child) => child.node.id == 'Resource'
    ) as elb.CfnTargetGroup ;
    cfnTargetGroup.targetType = 'ip';
    // console.error(targetGroup.node.children);

    // クエリパラメーター(tg=ecs-bg や tg=ec2-asg などでの)でターゲットグループ振り分けルールの設定
    albListener.addTargets('ec2-asg', {
      targetGroupName: "ec2-asg",
      port: 80,
      targets: [],
      healthCheck: {
        path: "/health"
      },
      conditions: [
        elb.ListenerCondition.queryStrings([
          {key: "tg", value: "ec2-asg"}
        ])
      ],
      priority: 1
    });

    const targetGroupEcsBg1 = albListener.addTargets('ecs-bg-1', {
      targetGroupName: "ecs-bg-1",
      port: 80,
      targets: [],
      healthCheck: {
        path: "/health"
      },
      conditions: [
        elb.ListenerCondition.queryStrings([
          {key: "tg", value: "ecs-bg"}
        ])
      ],
      priority: 2
    });
    const cfnTargetGroupEcsBg1 = targetGroupEcsBg1.node.children.find(
      // TODO id が 'Resource' でTargetGroupが取得できる理由が謎だが、console.error(targetGroup.node.children)で中を見たところ、このnodeしか存在しなかったのでひとまず
      (child) => child.node.id == 'Resource'
    ) as elb.CfnTargetGroup ;
    cfnTargetGroupEcsBg1.targetType = 'ip';

    const albListenerEcsBg = alb.addListener('HttpListenerEcsBg', {
      port: 9000,
      protocol: elb.ApplicationProtocol.HTTP,
      open: true,
    });

    const targetGroupEcsBg2 = albListenerEcsBg.addTargets('ecs-bg-2', {
      targetGroupName: "ecs-bg-2",
      port: 80,
      targets: [],
      healthCheck: {
        path: "/health"
      },
      // * ポート9000で受け付けるターゲットは1つしかないのでconditionsは不要
      // conditions: [
      //   elb.ListenerCondition.queryStrings([
      //     {key: "tg", value: "ecs-bg"}
      //   ])
      // ]
    });
    const cfnTargetGroupEcsBg2 = targetGroupEcsBg2.node.children.find(
      // TODO id が 'Resource' でTargetGroupが取得できる理由が謎だが、console.error(targetGroup.node.children)で中を見たところ、このnodeしか存在しなかったのでひとまず
      (child) => child.node.id == 'Resource'
    ) as elb.CfnTargetGroup ;
    cfnTargetGroupEcsBg2.targetType = 'ip';

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