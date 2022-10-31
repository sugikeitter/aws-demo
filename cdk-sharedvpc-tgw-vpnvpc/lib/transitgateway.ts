import {
  aws_ec2 as ec2
 } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface TransitGatewayProps {
  sharedVpc: ec2.Vpc,
  vpnVpc: ec2.Vpc,
}

export class TransitGateway extends Construct {
  constructor(scope: Construct, id: string, props: TransitGatewayProps) {
    super(scope, id);
    // TransitGateway
    const tgw = new ec2.CfnTransitGateway(this, 'DemoTgw', {
      tags: [{key: 'Name', value: 'DemoTgw'}],
      description: 'Demo Transit Gateway created by CDK',
      defaultRouteTableAssociation: 'disable',
      defaultRouteTablePropagation: 'disable',
    });

    const tgwAttachSharedVpc = new ec2.CfnTransitGatewayAttachment(this, 'tgwAttachSharedVpc', {
      tags: [{key: 'Name', value: 'toSharedVpc'}],
      transitGatewayId: tgw.attrId,
      vpcId: props.sharedVpc.vpcId,
      subnetIds: props.sharedVpc.selectSubnets({subnetGroupName: 'tgw'}).subnetIds,
    });

    /* TODO Tgw Route Table の Route と Propargation? */

    // Shared VPC
    const tgwRouteTableSharedVpc = new ec2.CfnTransitGatewayRouteTable(this, 'tgwRouteTableSharedVpc', {
      tags: [{key: 'Name', value: 'SharedVpcRoute'}],
      transitGatewayId: tgw.attrId,
    });

    const tgwRtAssociationSharedVpc = new ec2.CfnTransitGatewayRouteTableAssociation(this, 'tgwRtAssociationSharedVpc', {
      transitGatewayAttachmentId: tgwAttachSharedVpc.attrId,
      transitGatewayRouteTableId: tgwRouteTableSharedVpc.ref,
    });

    // Private VPC
    const tgwAttachPrivateVpc = new ec2.CfnTransitGatewayAttachment(this, 'tgwAttachPrivateVpc', {
      tags: [{key: 'Name', value: 'toPrivateVpc'}],
      transitGatewayId: tgw.attrId,
      vpcId: props.vpnVpc.vpcId,
      subnetIds: props.vpnVpc.selectSubnets({subnetGroupName: 'tgw'}).subnetIds,
    });

    const tgwRouteTablePrivateVpc = new ec2.CfnTransitGatewayRouteTable(this, 'tgwRouteTablePrivateVpc', {
      tags: [{key: 'Name', value: 'PrivateVpcRoute'}],
      transitGatewayId: tgw.attrId,
    });

    const tgwRtAssociationPrivateVpc = new ec2.CfnTransitGatewayRouteTableAssociation(this, 'tgwRtAssociationPrivateVpc', {
      transitGatewayAttachmentId: tgwAttachPrivateVpc.attrId,
      transitGatewayRouteTableId: tgwRouteTablePrivateVpc.ref,
    });

    const tgwRoutePrivateVpc = new ec2.CfnTransitGatewayRoute(this, 'tgwRoutePrivateVpc', {
      transitGatewayRouteTableId: tgwRouteTablePrivateVpc.ref,
      destinationCidrBlock: '0.0.0.0/0',
      transitGatewayAttachmentId: tgwAttachSharedVpc.attrId,
    });

    // Propagation はTGWルートテーブルに関連付けているアタッチメントのVPCのCIDR(サブネットではなくVPC)をTGWルートテーブルのルートに設定する
    // SharedVpcが使うルートはprivateVpcへのCIDRを設定する必要があるので、これ使う？
    const tgwRtPropagationShareVpc = new ec2.CfnTransitGatewayRouteTablePropagation(this, 'tgwRtPropagationShareVpc', {
      transitGatewayAttachmentId: tgwAttachPrivateVpc.attrId,
      transitGatewayRouteTableId: tgwRouteTableSharedVpc.ref,
    });

    // TODO VPCのルートテーブルにtgw attachのルートを
    props.vpnVpc.selectSubnets({subnetGroupName: 'private'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'TgwRoutePrivate' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: '0.0.0.0/0',
        transitGatewayId: tgw.attrId,
      }));
    });

    // TODO
    props.sharedVpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'TgwRouteShared' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: props.vpnVpc.vpcCidrBlock,
        // destinationCidrBlock: "10.0.0.0/16", // TODO
        transitGatewayId: tgw.attrId,
      }));
    });
  }
}