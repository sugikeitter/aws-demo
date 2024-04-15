import {
  App,
  aws_ec2 as ec2,
  Stack,
  StackProps,
} from 'aws-cdk-lib'
import { AlbEc2Asg } from './alb-ec2-asg';
// import { AlbEcs } from './alb-ecs-bg';
// import { RdsPostgres } from './rds-postgres';

export interface SharedVpcAlbProps extends StackProps {
  vpc: ec2.Vpc,
}
export class AlbAppStack extends Stack {
  constructor(scope: App, id: string, props: SharedVpcAlbProps) {
    super(scope, id, props);

    // ALBx1 に EC2+RDS アプリ、EC2+ASG アプリを作成
    new AlbEc2Asg(this, 'Ec2', {
      vpc: props.vpc,
      // rdsPostgres: rdsPostgres
    });

    // TODO --- Construct に切り出し ----
    /* ALBx1、ECS Blue/Green Deployment 用にリスナーx2 + ターゲットグループx2、ECS（ローリングデプロイ用）の空のターゲットグループを作成 */
    // new AlbEcs(this, 'Ecs', {
    //     vpc: props.vpc,
    //   })
  }
}
