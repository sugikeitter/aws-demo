import {
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
import { SslPolicy } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface AlbEcsProps {
  vpc: ec2.Vpc,
  albListenerHttps: elb.ApplicationListener,
}

export class AlbEcs extends Construct {
  constructor(scope: Construct, id: string, props: AlbEcsProps) {
    super(scope, id)

    // ECS（ローリングデプロイ）用のタスク実行ロール
    const ecsTaskExecRole = new iam.Role(this, 'EcsTaskExecRole', {
      // CI/CD のため CodeCommit のリポジトリに入れている taskdef.json で指定するため roleName は指定しておく
      roleName: "ecs-task-exec-for-demo-pipeline",
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")
      ],
      inlinePolicies: {
        'EcsExecPolicy': iam.PolicyDocument.fromJson({
          "Version": "2012-10-17",
          "Statement": [
            {
              "Action": [
                "ecr:BatchCheckLayerAvailability",
                "ecr:BatchGetImage",
                "ecr:GetDownloadUrlForLayer"
              ],
              "Resource": "arn:aws:ecr:" + process.env.AWS_REGION || "ap-northeast-1" + ":" + process.env.AWS_ACCOUNT_ID + ":repository/demo-ecs-*",
              "Effect": "Allow"
            },
            {
              "Action": "ecr:GetAuthorizationToken",
              "Resource": "*",
              "Effect": "Allow"
            }
          ]
        })
      },
    });
    // ECS（ローリングデプロイ）用のタスクロール: ecs-exec が使用できるようにしておく
    const ecsTaskRole = new iam.Role(this, 'EcsTaskRoleForExec', {
      // CI/CD のため CodeCommit のリポジトリに入れている taskdef.json で指定するため roleName は指定しておく
      roleName: "ecs-task-for-demo-pipeline",
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        'EcsExecPolicy': iam.PolicyDocument.fromJson({
          "Version": "2012-10-17",
          "Statement": [
            {
              "Sid": "ecsexec",
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

    // ALB とリスナーを props から受け取る
    const albListenerHttps = props.albListenerHttps;
    const alb = albListenerHttps.loadBalancer;

    // L2 Construct で CodeDeploy の B/G を使用する場合、DeploymentGroup 作成時に ECS Service を CDK で定義しないといけない
    const ecsCluster = new ecs.Cluster(this, 'DemoCluster', {
      // clusterName: "DemoFargate",
      vpc: props.vpc
    });

    // TODO: 事前に ECR リポジトリを作成しておく
    const ecrRepo = ecr.Repository.fromRepositoryName(this, 'GolangDemoHttpRepo', 'demo-ecs-bg-deploy-pipeline')
    const latestImage = ecs.ContainerImage.fromEcrRepository(
      ecrRepo,
      'codecommit-latest'
    );

    const taskDefForBg = new ecs.FargateTaskDefinition(this, 'TaskDefForBg', {
      family: 'TaskDefFamilyForBg',
      cpu: 256,
      memoryLimitMiB: 512,
      taskRole: ecsTaskRole,
      executionRole: ecsTaskExecRole,
    });
    taskDefForBg.addContainer('HttpBlue', {
      containerName: 'http-on-aws',
      // image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      image: latestImage,
      portMappings: [
        {hostPort: 80, containerPort: 80}
      ],
      environment: {
        "MESSAGE": "ECS Blue/Green Deployment",
      },
    });

    // ECS サービスの SG
    const ecsSvcBgSg = new ec2.SecurityGroup(this, 'EcsSvcBgSg', {
      vpc: props.vpc,
    });
    // Instantiate an Amazon ECS Service
    const ecsService = new ecs.FargateService(this, 'EcsFargateBg', {
      // serviceName: 'demoEcsFargateBg',
      cluster: ecsCluster,
      taskDefinition: taskDefForBg,
      vpcSubnets: props.vpc.selectSubnets({ subnetGroupName: 'privateA' }),
      securityGroups:[ecsSvcBgSg],
      deploymentController: { type: ecs.DeploymentControllerType.CODE_DEPLOY },
      desiredCount: 1,
      minHealthyPercent: 50,
    });

    const hostedZoneName = ssm.StringParameter.valueForStringParameter(this, '/cdk/demo/alb/domain/hostedZoneName');
    const targetGroupEcsBg1 = albListenerHttps.addTargets('ecs-bg-1', {
      // targetGroupName: "demoEcs-bg-1",
      port: 80,
      targets: [ecsService],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      },
      conditions: [
        elb.ListenerCondition.hostHeaders([
          "ecs-bg.alb." + hostedZoneName
        ])
      ],
      priority: 2
    });

    // targetType: IP でターゲットが 0のターゲットグループを作成する場合、albListener.addTargets では指定できないため
    const targetGroupEcsBg2 = new elb.ApplicationTargetGroup(this, 'TgpEcsBg2', {
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
    const albListenerForEcsBg2 = alb.addListener('HttpListenerEcsBg2', {
      port: 9000,
      protocol: elb.ApplicationProtocol.HTTPS,
      open: false, // B/G 用のテストリスナーで空けている9000番ポートは、社内など特定の IP からのみに制限したいため
      certificates: [
        elb.ListenerCertificate.fromArn(
          // TODO: ACM を用意して SSM にパラメータ登録が事前に必要
          // *.alb.example.com のようなワイルドカードドメイン名での証明書にしておくことで、1 つの ALB でもホストヘッダーでターゲットグループを EC2/ECS などで分けられる
          ssm.StringParameter.valueForStringParameter(this, '/cdk/demo/alb/acmarn/wildcard/albdomain'))
      ],
      sslPolicy: SslPolicy.RECOMMENDED_TLS,
    });
    albListenerForEcsBg2.addTargetGroups('EcsBg2ListenerTg', {
      targetGroups: [
        targetGroupEcsBg2
      ],
    });

    // const targetGroupEcsBg2 = albListenerForEcsBg2.addTargets('ecs-bg-2', {
    //   // targetGroupName: "demoEcs-bg-2",
    //   port: 80,
    //   targets: [ecsService],
    //   healthCheck: {
    //     path: "/health",
    //     healthyThresholdCount: 2,
    //     unhealthyThresholdCount: 3
    //   }
    // });

    // ECS B/G 用の CodeDeploy リソース
    const codedeployEcsBgApp = new codedeploy.EcsApplication(this, 'EcsBgDeployApp', {
      // applicationName: 'DemoEcsBg',
    });
    new codedeploy.EcsDeploymentGroup(this, 'L2EcsBgDg', {
      application: codedeployEcsBgApp, // 指定しない場合は自動で作成してくれる
      service: ecsService,
      blueGreenDeploymentConfig: {
        blueTargetGroup: targetGroupEcsBg1,
        greenTargetGroup: targetGroupEcsBg2,
        listener: albListenerHttps,
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


    // ECS ローリングアップデート用のリソース (以降のリリースは CI/CD でタスク定義を更新)

    // TODO: 事前に ECR リポジトリを作成しておく
    const ecrRepoRolling = ecr.Repository.fromRepositoryName(this, 'GolangDemoEcsHttpRepoRolling', 'demo-ecs-rolling-deploy-pipeline')
    const latestImageRolling = ecs.ContainerImage.fromEcrRepository(
      ecrRepoRolling,
      'codecommit-latest'
    );

    const taskDefForRolling = new ecs.FargateTaskDefinition(this, 'TaskDefForRolling', {
      family: 'TaskDefFamilyForRolling',
      cpu: 256,
      memoryLimitMiB: 512,
      taskRole: ecsTaskRole,
      executionRole: ecsTaskExecRole,
    });
    taskDefForRolling.addContainer('HttpBlue', {
      containerName: 'http-on-aws',
      // image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      image: latestImageRolling,
      portMappings: [
        {hostPort: 80, containerPort: 80}
      ],
      environment: {
        "MESSAGE": "ECS Rolling Deployment",
      },
    });
    // ECS サービス (ローリングデプロイ)
    const ecsSvcRollingSg = new ec2.SecurityGroup(this, 'EcsSvcRollingSg', {
      vpc: props.vpc,
    });
    const ecsServiceRolling = new ecs.FargateService(this, 'EcsFargateRolling', {
      // serviceName: 'demoEcsFargateBg',
      cluster: ecsCluster,
      taskDefinition: taskDefForRolling,
      vpcSubnets: props.vpc.selectSubnets({ subnetGroupName: 'privateA' }),
      securityGroups:[ecsSvcRollingSg],
      desiredCount: 1,
      minHealthyPercent: 50
    });
    albListenerHttps.addTargets('ecs-rolling', {
      // targetGroupName: "demoEcsR",
      port: 80,
      targets: [ecsServiceRolling],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      },
      conditions: [
        elb.ListenerCondition.hostHeaders([
          "ecs-rolling.alb." + hostedZoneName
        ])
      ],
      priority: 3
    });

    /* https://ec2-asg.alb.example.com のような独自ドメインで ALB に https アクセスするために Route53 に A レコード作成 */
    // TODO: Route53 のホストゾーンを作成し、SSM パラメーターストアにゾーン ID とゾーン名を用意しておく
    const hostedAoneId = ssm.StringParameter.valueForStringParameter(this, '/cdk/demo/alb/domain/hostedZoneId');
    const hostZone = r53.HostedZone.fromHostedZoneAttributes(this, 'HostZone', {
      hostedZoneId: hostedAoneId,
      zoneName: hostedZoneName,
    });
    new r53.ARecord(this, 'AlbEcsBg', {
      zone: hostZone,
      recordName: 'ecs-bg.alb.' + hostedZoneName,
      target: r53.RecordTarget.fromAlias(new r53tartet.LoadBalancerTarget(alb))
    });
    new r53.ARecord(this, 'AlbEcsRolling', {
      zone: hostZone,
      recordName: 'ecs-rolling.alb.' + hostedZoneName,
      target: r53.RecordTarget.fromAlias(new r53tartet.LoadBalancerTarget(alb))
    });
  }
}
