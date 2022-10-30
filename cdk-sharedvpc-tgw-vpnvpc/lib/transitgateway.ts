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

    const tgwAttachSharedVpc = new ec2.CfnTransitGatewayAttachment(this, 'DemoTgwAttach', {
      tags: [{key: 'Name', value: 'toSharedVpc'}],
      transitGatewayId: tgw.attrId,
      vpcId: props.sharedVpc.vpcId,
      subnetIds: props.sharedVpc.selectSubnets({subnetGroupName: 'tgw'}).subnetIds,
    });

    // TODO Tgw Route Table と Assosiation
    const tgwRouteTableSharedVpc = new ec2.CfnTransitGatewayRouteTable(this, 'DemoTgwRt', {
      tags: [{key: 'Name', value: 'SharedVpcRoute'}],
      transitGatewayId: tgw.attrId,
    });

    const tgwRtAssociationShareVpc = new ec2.CfnTransitGatewayRouteTableAssociation(this, 'tgwRtAssociationShareVpc', {
      transitGatewayAttachmentId: tgwAttachSharedVpc.attrId,
      transitGatewayRouteTableId: tgwRouteTableSharedVpc.ref,
    });

/* static route?
    const sharedVpcRoute = new ec2.CfnTransitGatewayRoute(this, 'sharedVpcRoute', {
      transitGatewayRouteTableId: tgwRouteTableSharedVpc.logicalId,
    });
*/


    // TODO 必要？
    // const tgwRtPropagationShareVpc = new ec2.CfnTransitGatewayRouteTablePropagation(this, 'tgwRtPropagationShareVpc', {
    //   transitGatewayAttachmentId: tgwAttachSharedVpc.attrId,
    //   transitGatewayRouteTableId: tgwRouteTableSharedVpc.ref,
    // });
  }
}