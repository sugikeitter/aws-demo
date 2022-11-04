import {
  aws_ec2 as ec2,
} from 'aws-cdk-lib'
import { Construct } from 'constructs';

export class PrivateVpcVpn extends Construct {
  public readonly vpc: ec2.Vpc;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Default VPC と同じ IP から PrivateLink 接続を確認するために
    const MY_PRIVATE_VPCTGW_VPN_CIDR = process.env.MY_PRIVATE_VPCTGW_VPN_CIDR || "10.0.0.0/16";
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(MY_PRIVATE_VPCTGW_VPN_CIDR),
      maxAzs: 3,
      subnetConfiguration: [
        {
          cidrMask: 28,
          name: 'tgw', // TODO to Shared NW w/ IGW
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 22,
          name: 'private', // TODO public route to tgw
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 26, // Cidr block must be at least /27
          name: 'clientVpnEni', // TODO Client VPN Endpoint は手動作成
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ]
    });

    // 0.0.0.0/0 -> port:80 を許可する SG を作成
    const sg = new ec2.SecurityGroup(this, 'Port80FromPublic', {
      securityGroupName: 'Port80FromPublic',
      vpc: this.vpc
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    // TODO Client VPN の SG を作成
  }
}