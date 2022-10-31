import {
  aws_ec2 as ec2
 } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface TransitGatewayProps {
  sharedVpc: ec2.Vpc,
  vpnVpc: ec2.Vpc,
}

export class TransitGateway extends Construct {
  public readonly tgw: ec2.CfnTransitGateway;
  constructor(scope: Construct, id: string, props: TransitGatewayProps) {
    super(scope, id);
    // TransitGateway
    this.tgw = new ec2.CfnTransitGateway(this, 'DemoTgw', {
      tags: [{key: 'Name', value: 'DemoTgw'}],
      description: 'Demo Transit Gateway created by CDK',
      defaultRouteTableAssociation: 'disable',
      defaultRouteTablePropagation: 'disable',
    });
    // TODO Transit Gateway の作成完了を待つ、でないと Route などの Transit Gateway に関連するリソース作成時に `Error Code: InvalidTransitGatewayID.NotFound` が発生する？

    const tgwAttachSharedVpc = new ec2.CfnTransitGatewayAttachment(this, 'tgwAttachSharedVpc', {
      tags: [{key: 'Name', value: 'toSharedVpc'}],
      transitGatewayId: this.tgw.attrId,
      vpcId: props.sharedVpc.vpcId,
      subnetIds: props.sharedVpc.selectSubnets({subnetGroupName: 'tgw'}).subnetIds,
    });

    /* TODO Tgw Route Table の Route と Propargation? */

    // Shared VPC
    const tgwRouteTableSharedVpc = new ec2.CfnTransitGatewayRouteTable(this, 'tgwRouteTableSharedVpc', {
      tags: [{key: 'Name', value: 'SharedVpcRoute'}],
      transitGatewayId: this.tgw.attrId,
    });

    const tgwRtAssociationSharedVpc = new ec2.CfnTransitGatewayRouteTableAssociation(this, 'tgwRtAssociationSharedVpc', {
      transitGatewayAttachmentId: tgwAttachSharedVpc.attrId,
      transitGatewayRouteTableId: tgwRouteTableSharedVpc.ref,
    });

    // Private VPC
    const tgwAttachPrivateVpc = new ec2.CfnTransitGatewayAttachment(this, 'tgwAttachPrivateVpc', {
      tags: [{key: 'Name', value: 'toPrivateVpc'}],
      transitGatewayId: this.tgw.attrId,
      vpcId: props.vpnVpc.vpcId,
      subnetIds: props.vpnVpc.selectSubnets({subnetGroupName: 'tgw'}).subnetIds,
    });

    const tgwRouteTablePrivateVpc = new ec2.CfnTransitGatewayRouteTable(this, 'tgwRouteTablePrivateVpc', {
      tags: [{key: 'Name', value: 'PrivateVpcRoute'}],
      transitGatewayId: this.tgw.attrId,
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
  }
}