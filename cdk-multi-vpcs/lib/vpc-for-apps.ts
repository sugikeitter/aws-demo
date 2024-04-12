import {
  aws_ec2 as ec2,
} from 'aws-cdk-lib'
import { Construct } from 'constructs';

export class AppsVpc extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly nwfwEndpointIds: string[] = [];
  constructor(scope: Construct, id: string, maxAzs: number, vpcCidr: string) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      maxAzs: maxAzs,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public', // privateA に向けたトラフィックは NWFW endpoint へのルートを設定する
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 28,
          name: 'tgw', // 別の Construct で Transit Gateway を作成し、そこで他の NW へのルートを設定する
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 22,
          name: 'privateA', // 0.0.0.0 に向けたトラフィックは NWFW endpoint へのルートを設定する
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ]
    });

    // 0.0.0.0/0 -> port:80 を許可する SG を作成
    new ec2.SecurityGroup(this, 'Port80FromPublic', {
      securityGroupName: 'Port80FromPublic',
      vpc: this.vpc
    }).addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));


    // 0.0.0.0/0 -> port:443 を許可する SG を作成
    new ec2.SecurityGroup(this, 'Port443FromPublic', {
      securityGroupName: 'Port443FromPublic',
      vpc: this.vpc
    }).addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
  }
}
