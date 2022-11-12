import {
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elb,
} from 'aws-cdk-lib'
import { Construct } from 'constructs';

export interface SharedVpcAlbProps {
  vpc: ec2.Vpc,
}
export class SharedVpcAlb extends Construct {
  constructor(scope: Construct, id: string, props: SharedVpcAlbProps) {
    super(scope, id);
    const albSg = new ec2.SecurityGroup(this, 'Sg', {
      vpc: props.vpc,
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    const albSubnets: ec2.SubnetSelection = {
      subnetType: ec2.SubnetType.PUBLIC,
    };
    const alb = new elb.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      vpcSubnets: albSubnets,
      internetFacing: true,
      securityGroup: albSg
    });
    const albListener = alb.addListener('EcsHttpListener', {
      port: 80,
      open: true,
    });
    const appTargetGroup = albListener.addTargets('', {
      port: 80
    });
  }
}