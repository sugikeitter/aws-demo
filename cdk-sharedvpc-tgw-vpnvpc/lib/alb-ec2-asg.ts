import {
  aws_autoscaling as asg,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elb,
  aws_iam as iam,
  Duration,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { RdsPostgres } from './rds-postgres'

export interface AlbEc2AsgProps {
  vpc: ec2.Vpc;
  rdsPostgres: RdsPostgres;
}

export class AlbEc2Asg extends Construct {
  constructor(scope: Construct, id: string, props: AlbEc2AsgProps) {
    super(scope, id)

    /* ALB, Listener, TargetGroup */
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      // インバウンドルールは ALB のリスナーを作成すると自動生成されるのでここでは設定しない
      // securityGroupName: 'DemoAlbSg',
      vpc: props.vpc,
    });

    const demoAlb = new elb.ApplicationLoadBalancer(this, 'Alb', {
      // loadBalancerName: "DemoAlb",
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({subnetGroupName: 'public'}),
      internetFacing: true,
      securityGroup: albSg
    });

    // Listener はデフォルトで EC2(RDSへ接続)、クエリパラメーターで EC2+ASG や ECS(ローリングデプロイ)のターゲットへ振り分け
    const albListener = demoAlb.addListener('HttpListener', {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      open: true,
    });

    // デフォルトは EC2+RDS のアプリへ
    const targetGroupEc2Rds = albListener.addTargets('ec2-rds', {
      // targetGroupName: "demoEc2-rds",
      port: 8000,
      targets: [],
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });
    // EC2+ASG のアプリ: クエリパラメーター(tg=ec2-asg)
    const targetGroupEc2Asg = albListener.addTargets('TgEc2Asg', {
      // targetGroupName: "demoEc2-asg",
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

    /* EC2+RDS アプリ */
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
      "RDS_SECRET_ID='" + props.rdsPostgres.dbInstancePostgres?.secret?.secretName + "'",
      "EOF",
      "",
      "systemctl start fastapi",
    );

    // Secrets Manager へアクセスするポリシーを追加したロール
    const roleEc2Rds = new iam.Role(this, 'SsmRoleForEc2Rds', {
      // roleName: 'SsmRoleForEc2RdsSecrets',
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
                  props.rdsPostgres.dbInstancePostgres?.secret?.secretArn,
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

    // 起動テンプレート
    const launchTemplateForEc2Rds = new ec2.LaunchTemplate(this, 'FastApiJinjaSqlAlchemy', {
      // launchTemplateName: "fastapi-jinja-sqlalchemy",
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      userData: userDataForEc2Rds,
      // constructor では SG の複数設定はできないので、後ほど connections を利用して DB へアクセスできる SG を追加
      securityGroup: ec2SgForEc2Rds,
      role: roleEc2Rds,
    });
    launchTemplateForEc2Rds.connections.addSecurityGroup(props.rdsPostgres.dbClientSg);

    // AutoScaling Group(`launcTemplate:` を変数で用意しなくてもASGのプロパティ指定でlaunchTemplateも作成してくれるが、分割した方が今後拡張しやすそうなので)
    const asgForEc2Rds = new asg.AutoScalingGroup(this, 'AsgRds', {
      vpc: props.vpc,
      // autoScalingGroupName: "ec2-rds",
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

    // 起動テンプレート
    const userData = ec2.UserData.forLinux();
    // 本来は必要なパッケージをインストールしたAMIを利用すべき
    userData.addCommands(
      "sudo -u ec2-user sh -c \"curl https://raw.githubusercontent.com/sugikeitter/golang__http-server-on-aws/main/bin/go-http-linux > /home/ec2-user/httpServer\"",
      "sudo -u ec2-user chmod 755 /home/ec2-user/httpServer",
      "nohup sudo /home/ec2-user/httpServer 80 &"
    );
    // 変更してもデフォルトversionは最新に変わらないので注意、AutoScalingGroupのコンストラクタのプロパティに渡した場合は、最新Ver.をASGが指定してくれるようにはなっている
    const launchTemplate = new ec2.LaunchTemplate(this, 'HttpOnAws', {
      // launchTemplateName: "http-server-on-aws",
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      userData: userData,
      securityGroup: ec2Sg,
      role: iam.Role.fromRoleName(this, 'SsmRoleForEc2', 'AmazonSSMRoleForInstancesQuickSetup'),
    });

    // AutoScaling Group(launcTemplateの変数を用意しなくてもASGのプロパティ指定でlaunchTemplateも作成してくれるが、分割した方が今後拡張しやすそうなので)
    const ec2Asg = new asg.AutoScalingGroup(this, 'AsgHttp', {
      vpc: props.vpc,
      // autoScalingGroupName: "go-http",
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
  }
}