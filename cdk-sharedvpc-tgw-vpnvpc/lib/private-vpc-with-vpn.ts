import {
  aws_ec2 as ec2,
} from 'aws-cdk-lib'
import { Construct } from 'constructs';

// TODO props TGW, SharedVpc
export interface PrivateVpcVpnProps {

}

export class PrivateVpcVpn extends Construct {
  public readonly vpc: ec2.Vpc;
  constructor(scope: Construct, id: string, props: PrivateVpcVpnProps) {
    super(scope, id);

    // Default VPC と同じ IP から PrivateLink 接続を確認するために
    const MY_PRIVATE_VPCTGW_VPN_CIDR = process.env.MY_PRIVATE_VPCTGW_VPN_CIDR || "10.0.0.0/16";
    this.vpc = new ec2.Vpc(this, 'DemoPrivateVpcVpn', {
      ipAddresses: ec2.IpAddresses.cidr(MY_PRIVATE_VPCTGW_VPN_CIDR),
      maxAzs: 3,
      subnetConfiguration: [
        {
          cidrMask: 28,
          name: 'tgw', // TODO to Shared NW w/ IGW
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 28,
          name: 'clientVpnEni', // TODO Client VPN Endpoint は手動作成
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 22,
          name: 'private', // TODO public route to tgw
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ]
    });
  }
}