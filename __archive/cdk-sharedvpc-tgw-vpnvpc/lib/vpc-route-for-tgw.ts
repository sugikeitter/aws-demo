import {
  aws_ec2 as ec2
 } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface VpcRouteForTgwProps {
  sharedVpc: ec2.Vpc,
  nwfwEndpointIds: string[],
  vpnVpc: ec2.Vpc,
  tgw: ec2.CfnTransitGateway
}

export class VpcRouteForTgw extends Construct {
  constructor(scope: Construct, id: string, props: VpcRouteForTgwProps) {
    super(scope, id);

    // VPCのルートテーブルにtgw attachのルートを
    props.vpnVpc.selectSubnets({subnetGroupName: 'private'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'TgwRoutePrivate' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: '0.0.0.0/0',
        transitGatewayId: props.tgw.attrId,
      }));
    });

    // SharedVPC → PrivateVPC への経路の場合、NWFW endpoint を経由して TGW へのルートを追加
    props.sharedVpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'TgwRouteShared' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: props.vpnVpc.vpcCidrBlock,
        transitGatewayId: props.tgw.attrId,
      }));
    });

    // tgw endpoint があるサブネットから 0.0.0.0 へは Network Firewall endpoint のルートを追加
    props.sharedVpc.selectSubnets({subnetGroupName: 'tgw'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'RouteSharedTgwEni' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: "0.0.0.0/0",
        vpcEndpointId: props.nwfwEndpointIds[i]
      }));
    });

    // VpnVpc→TGW→IGWのトラフィックをTGWを経由して戻すが、そのためにはNetwork Firewall endpoint を通過させる
    props.sharedVpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach((subnet, i) => {
      // NATGWがAZの数より少ない場合は非対称ルートが発生しないよう、PrivateVpcのサブネットのCIDRごとに戻りのnwfw endpointのサブネットも行きで通ったAZに戻すルート
      props.vpnVpc.selectSubnets({subnetGroupName: 'private'}).subnets.forEach((privateSubnetVpnVpc, j) => {
        subnet.node.children.push(new ec2.CfnRoute(this, 'RouteSharedPublicToPrivateVpc' + i + j, {
          routeTableId: subnet.routeTable.routeTableId,
          destinationCidrBlock: privateSubnetVpnVpc.ipv4CidrBlock, // vpnVpc の サブネットのCIDR
          vpcEndpointId: props.nwfwEndpointIds[j]
        }));
      });
    });

    // VpnVpc→TGW→SharedVPC PrivateサブネットのトラフィックをTGWを経由して戻すが、そのためにはNetwork Firewall endpoint を通過させる
    // TODO Shared VPC の private までは到達するが、戻りの通信がロストしていてこの設定でもまだ不十分
    props.sharedVpc.selectSubnets({subnetGroupName: 'tgw'}).subnets.forEach((subnet, i) => {
      // NATGWがAZの数より少ない場合は非対称ルートが発生しないよう、PrivateVpcのサブネットのCIDRごとに戻りのnwfw endpointのサブネットも行きで通ったAZに戻すルート
      props.sharedVpc.selectSubnets({subnetGroupName: 'privateA'}).subnets.forEach((privateSubnetVpnVpc, j) => {
        subnet.node.children.push(new ec2.CfnRoute(this, 'RouteSharedPrivateToVpnVpc' + i + j, {
          routeTableId: subnet.routeTable.routeTableId,
          destinationCidrBlock: privateSubnetVpnVpc.ipv4CidrBlock, // vpnVpc の サブネットのCIDR
          vpcEndpointId: props.nwfwEndpointIds[j]
        }));
      });
    });

    // TODO S2S VPNをVGWで利用する場合、オンプレのCIDR範囲(任意)であればVGWへ接続するルートを追加
  }
}
