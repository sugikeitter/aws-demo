import {
  aws_autoscaling as asg,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elb,
  aws_iam as iam,
  aws_route53 as r53,
  aws_route53_targets as r53tartet,
  aws_ssm as ssm,
  Duration,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

// import { RdsPostgres } from './rds-postgres'

export interface AlbEc2AsgProps {
  vpc: ec2.Vpc;
  albListenerHttps: elb.ApplicationListener,
  // rdsPostgres?: RdsPostgres;
}

export class AlbEc2Asg extends Construct {
  constructor(scope: Construct, id: string, props: AlbEc2AsgProps) {
    super(scope, id)

    /* https://ec2-asg.alb.example.com のような独自ドメインで ALB に https アクセスするために Route53 に A レコード作成 */
    // TODO: Route53 のホストゾーンを作成し、SSM パラメーターストアにゾーン ID とゾーン名を用意しておく
    const hostedZoneName = ssm.StringParameter.valueForStringParameter(this, '/cdk/demo/alb/domain/hostedZoneName');
    const hostedAoneId = ssm.StringParameter.valueForStringParameter(this, '/cdk/demo/alb/domain/hostedZoneId');

    /* ASG 用のインスタンスの起動テンプレート */
    // ALBからのみアクセスを受けるEC2のSG
    const ec2Sg = new ec2.SecurityGroup(this, 'Ec2FromPublicSubnet', {
      vpc: props.vpc,
    });
    // ALB と EC2 を連携させると、CDK が自動でルール作成してくれる
    // ec2Sg.addIngressRule(albSg, ec2.Port.tcp(80));

    // ユーザーデータを設定した起動テンプレートの作成
    const userData = ec2.UserData.forLinux();
    // WARN: 本来は必要なパッケージをインストールしたAMIを利用すべき
    userData.addCommands(
      "sudo -u ec2-user sh -c \"curl https://raw.githubusercontent.com/sugikeitter/golang__http-server-on-aws/main/bin/go-http-linux > /home/ec2-user/httpServer\"",
      "sudo -u ec2-user chmod 755 /home/ec2-user/httpServer",
      "nohup sudo /home/ec2-user/httpServer 80 &"
    );
    // 変更してもデフォルトversionは最新に変わらないので注意、AutoScalingGroupのコンストラクタのプロパティに渡した場合は、最新Ver.をASGが指定してくれるようにはなっている
    const launchTemplate = new ec2.LaunchTemplate(this, 'HttpOnAws', {
      // launchTemplateName: "http-server-on-aws",
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      userData: userData,
      securityGroup: ec2Sg,
      role: iam.Role.fromRoleName(this, 'SsmRoleForEc2', 'AmazonSSMRoleForInstancesQuickSetup'),
    });

    /* Auto Scaling Group の*/
    // AutoScaling Group(launcTemplateの変数を用意しなくてもASGのプロパティ指定でlaunchTemplateも作成してくれるが、分割した方が今後拡張しやすそうなので)
    const ec2Asg = new asg.AutoScalingGroup(this, 'AsgHttp', {
      vpc: props.vpc,
      // autoScalingGroupName: "go-http",
      healthCheck: asg.HealthCheck.elb({
        grace: Duration.seconds(30)
      }),
      // desiredCapacity: 1, // WARN: desiredCapacity を設定すると `cdk deploy` デプロイの度に台数が更新される
      minCapacity: 1,
      maxCapacity: 3,
      launchTemplate: launchTemplate,
      vpcSubnets: props.vpc.selectSubnets({subnetGroupName: 'privateA'})
    });

    props.albListenerHttps.addTargets('TgEc2Asg', {
      // targetGroupName: "demoEc2-asg",
      port: 80,
      targets: [ec2Asg],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      },
      conditions: [
        elb.ListenerCondition.hostHeaders([
          "ec2-asg.alb." + hostedZoneName
        ])
      ],
      priority: 1
    });
    // Auto Scaling の動的スケーリングポリシーを追加
    ec2Asg.scaleOnRequestCount('100reqPerMinutes', {
      targetRequestsPerMinute: 100
    });

    // https://ec2-asg.alb.example.com のような URL で ALB にアクセスするための A レコードを追加
    new r53.ARecord(this, 'AlbEc2Asg', {
      zone: r53.HostedZone.fromHostedZoneAttributes(this, 'HostZone', {
        hostedZoneId: hostedAoneId,
        zoneName: hostedZoneName,
      }),
      recordName: 'ec2-asg.alb.' + hostedZoneName,
      target: r53.RecordTarget.fromAlias(new r53tartet.LoadBalancerTarget(props.albListenerHttps.loadBalancer))
    });
  }
}