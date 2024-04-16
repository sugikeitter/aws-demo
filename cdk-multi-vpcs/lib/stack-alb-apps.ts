import {
  App,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elb,
  aws_ssm as ssm,
  Stack,
  StackProps,
} from 'aws-cdk-lib'
import { AlbEc2Asg } from './alb-ec2-asg';
import { AlbEcs } from './alb-ecs';
// import { RdsPostgres } from './rds-postgres';

export interface SharedVpcAlbProps extends StackProps {
  vpc: ec2.Vpc,
}
export class AlbAppStack extends Stack {
  constructor(scope: App, id: string, props: SharedVpcAlbProps) {
    super(scope, id, props);

    /* ALB とリスナーを作成し、ターゲットグループに ASG を紐づける */
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
    // ポート 443 で受け付ける ALB の Listener
    const albListenerHttps = demoAlb.addListener('HttpsListener', {
      port: 443,
      protocol: elb.ApplicationProtocol.HTTPS,
      open: true,
      defaultAction: elb.ListenerAction.fixedResponse(404),
      certificates: [
        elb.ListenerCertificate.fromArn(
          // TODO: ACM を用意して SSM にパラメータ登録が事前に必要
          // *.alb.example.com のようなワイルドカードドメイン名での証明書にしておくことで、1 つの ALB でもホストヘッダーでターゲットグループを EC2/ECS などで分けられっる
          ssm.StringParameter.valueForStringParameter(this, '/cdk/demo/alb/acmarn/wildcard/albdomain'))
      ]
    });

    // TODO hostzone の情報を SSM パラメーターストアから持ってくる処理はここでやって、各 Constructor に渡す


    // ALB に EC2+ASG のターゲットを紐付け
    new AlbEc2Asg(this, 'Ec2Asg', {
      vpc: props.vpc,
      albListenerHttps: albListenerHttps,
    });

    // ALB に ECS を紐付け
    // TODO AlbEcs をローリングとB/Gで Constructor 分割する
    new AlbEcs(this, 'Ecs', {
      vpc: props.vpc,
      albListenerHttps: albListenerHttps,
    });

    

  }
}
