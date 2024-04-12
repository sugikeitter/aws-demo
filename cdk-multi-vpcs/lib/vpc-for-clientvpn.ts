import {
  aws_ec2 as ec2,
} from 'aws-cdk-lib'
import { Construct } from 'constructs';

export class VpnVpc extends Construct {
  public readonly vpc: ec2.Vpc;
  constructor(scope: Construct, id: string, maxAzs: number, vpcCidr: string) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      maxAzs: maxAzs,
      subnetConfiguration: [
        {
          cidrMask: 28,
          name: 'tgw', // for tgw eni to connect to a shared VPC
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 22,
          name: 'private', // for EC2 instances etc
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 26, // Cidr block must be at least /27
          name: 'clientVpnEni', // TODO Client VPN Endpoint は今のところ手動で作成
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

    // TODO Client VPN エンドポイントを作成
    // - 現状は手動で ACM の作成と IAM Identity Center の設定をしたエンドポイントを用意している
    // - ACM で証明書作成が事前に必要

  }
}