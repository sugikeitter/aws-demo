import {
  aws_ec2 as ec2
 } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface TransitGatewayProps {
  sharedVpc: ec2.Vpc,
  vpnVpc: ec2.Vpc,
  appVpc: ec2.Vpc,
}

export class TransitGateway extends Construct {
  public readonly tgw: ec2.CfnTransitGateway;

  constructor(scope: Construct, id: string, props: TransitGatewayProps) {
    super(scope, id);
    // TransitGateway
    this.tgw = new ec2.CfnTransitGateway(this, 'Tgw', {
      tags: [{key: 'Name', value: 'DemoTgw'}],
      description: 'Demo Transit Gateway created by CDK',
      defaultRouteTableAssociation: 'disable',
      defaultRouteTablePropagation: 'disable',
    });

    /* TGW Route for Shared VPC */
    const tgwRouteTableSharedVpc = new ec2.CfnTransitGatewayRouteTable(this, 'RtSharedVpc', {
      tags: [{key: 'Name', value: 'SharedVpcRoute'}],
      transitGatewayId: this.tgw.attrId,
    });
    const tgwAttachSharedVpc = new ec2.CfnTransitGatewayAttachment(this, 'AttachSharedVpc', {
      tags: [{key: 'Name', value: 'forSharedVpc'}],
      transitGatewayId: this.tgw.attrId,
      vpcId: props.sharedVpc.vpcId,
      subnetIds: props.sharedVpc.selectSubnets({subnetGroupName: 'tgw'}).subnetIds,
      // TGW で接続している他の VPC 同士のプライベートな通信も Shared VPC の NWFW を通したい場合はアプライアンスモード有効化が必要
      options: {
        "ApplianceModeSupport": "enable"
      }
    });
    new ec2.CfnTransitGatewayRouteTableAssociation(this, 'RouteAssociationSharedVpc', {
      transitGatewayAttachmentId: tgwAttachSharedVpc.attrId,
      transitGatewayRouteTableId: tgwRouteTableSharedVpc.ref,
    });

    /* TGW Route for VPN VPC/App VPC */
    const tgwRouteTableToSharedVpc = new ec2.CfnTransitGatewayRouteTable(this, 'RtToSharedVpc', {
      tags: [{key: 'Name', value: 'toSharedVpcRoute'}],
      transitGatewayId: this.tgw.attrId,
    });
    const tgwAttachPrivateVpc = new ec2.CfnTransitGatewayAttachment(this, 'AttachPrivateVpc', {
      tags: [{key: 'Name', value: 'forVpnVpc'}],
      transitGatewayId: this.tgw.attrId,
      vpcId: props.vpnVpc.vpcId,
      subnetIds: props.vpnVpc.selectSubnets({subnetGroupName: 'tgw'}).subnetIds,
    });
    const tgwAttachAppVpc = new ec2.CfnTransitGatewayAttachment(this, 'AttachAppVpc', {
      tags: [{key: 'Name', value: 'forAppVpc'}],
      transitGatewayId: this.tgw.attrId,
      vpcId: props.appVpc.vpcId,
      subnetIds: props.appVpc.selectSubnets({subnetGroupName: 'tgw'}).subnetIds,
    });
    new ec2.CfnTransitGatewayRouteTableAssociation(this, 'RouteAssociationPrivateVpc', {
      transitGatewayAttachmentId: tgwAttachPrivateVpc.attrId,
      transitGatewayRouteTableId: tgwRouteTableToSharedVpc.ref,
    });
    new ec2.CfnTransitGatewayRouteTableAssociation(this, 'RouteAssociationAppVpc', {
      transitGatewayAttachmentId: tgwAttachAppVpc.attrId,
      transitGatewayRouteTableId: tgwRouteTableToSharedVpc.ref,
    });
    new ec2.CfnTransitGatewayRoute(this, 'RoutePrivateVpc', {
      transitGatewayRouteTableId: tgwRouteTableToSharedVpc.ref,
      destinationCidrBlock: '0.0.0.0/0',
      transitGatewayAttachmentId: tgwAttachSharedVpc.attrId,
    });

    // Propagation はTGWルートテーブルに関連付けているアタッチメントのVPCのCIDR(サブネットではなくVPC)をTGWルートテーブルのルートに設定する
    // Shared VPC が使う TGW ルートテーブルに、App VPC や VPN VPC の CIDR とルートを自動で設定できる
    new ec2.CfnTransitGatewayRouteTablePropagation(this, 'RtPropagationFromVPNtoSharedVpc', {
      transitGatewayAttachmentId: tgwAttachPrivateVpc.attrId,
      transitGatewayRouteTableId: tgwRouteTableSharedVpc.ref,
    });
    new ec2.CfnTransitGatewayRouteTablePropagation(this, 'RtPropagationFromAppToSharedVpc', {
      transitGatewayAttachmentId: tgwAttachAppVpc.attrId,
      transitGatewayRouteTableId: tgwRouteTableSharedVpc.ref,
    });
  }
}