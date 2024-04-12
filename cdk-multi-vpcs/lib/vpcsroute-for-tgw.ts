import {
  aws_ec2 as ec2
 } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface VpcRouteForTgwProps {
  sharedVpc: ec2.Vpc,
  nwfwEndpointIds: string[],
  vpnVpc: ec2.Vpc,
  appVpc: ec2.Vpc,
  tgw: ec2.CfnTransitGateway
}

export class VpcRouteForTgw extends Construct {
  constructor(scope: Construct, id: string, props: VpcRouteForTgwProps) {
    super(scope, id);

    // VPN VPC → SharedVPC への経路のため、VPN VPC のプライベートサブネットのルートテーブルに tgw attach のルートを追加
    props.vpnVpc.selectSubnets({subnetGroupName: 'private'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'TgwRoutePrivate2Shared' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: '0.0.0.0/0',
        transitGatewayId: props.tgw.attrId,
      }));
    });

    // App VPC → SharedVPC への経路のため、App VPC のプライベートサブネットのルートテーブルに tgw attach のルートを追加
    props.appVpc.selectSubnets({subnetGroupName: 'privateA'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'TgwRouteApp2Shared' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: '0.0.0.0/0',
        transitGatewayId: props.tgw.attrId,
      }));
    });

   // some VPCs → TGW → Shared VPC → NWFW → IGW の経路で、元の VPC への戻り
    props.sharedVpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets.forEach((subnet, i) => {

      // SharedVPC → VPN VPC への経路の場合、NWFW endpoint を経由して TGW へのルートを追加
      subnet.node.children.push(new ec2.CfnRoute(this, 'TgwRouteShared2Private' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: props.vpnVpc.vpcCidrBlock,
        transitGatewayId: props.tgw.attrId,
      }));

      // SharedVPC → App VPC への経路の場合、NWFW endpoint を経由して TGW へのルートを追加
      subnet.node.children.push(new ec2.CfnRoute(this, 'TgwRouteShared2App' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: props.appVpc.vpcCidrBlock,
        transitGatewayId: props.tgw.attrId,
      }));
    });

    // Shared VPC の tgw endpoint があるサブネットから 0.0.0.0 へは Network Firewall endpoint を通るようにルートを追加
    props.sharedVpc.selectSubnets({subnetGroupName: 'tgw'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'RouteSharedTgwEni' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: "0.0.0.0/0",
        vpcEndpointId: props.nwfwEndpointIds[i]
      }));
    });

    // VPN VPC or App VPC → TGW → IGWのトラフィックをTGWを経由して戻すが、そのためにはNetwork Firewall endpoint を通過させる
    props.sharedVpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach((subnet, i) => {
      // Shared VPC の IGW → VPN VPC のために必要
      subnet.node.children.push(new ec2.CfnRoute(this, 'RouteSharedPublicToPrivateVpc' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: props.vpnVpc.vpcCidrBlock,
        vpcEndpointId: props.nwfwEndpointIds[i]
      }));
      // Shared VPC の IGW → App VPC
      subnet.node.children.push(new ec2.CfnRoute(this, 'RouteSharedPublicToAppVpc' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: props.appVpc.vpcCidrBlock,
        vpcEndpointId: props.nwfwEndpointIds[i]
      }));
    });

    // TODO S2S VPNをVGWで利用する場合、オンプレのCIDR範囲(任意)であればVGWへ接続するルートを追加
  }
}
