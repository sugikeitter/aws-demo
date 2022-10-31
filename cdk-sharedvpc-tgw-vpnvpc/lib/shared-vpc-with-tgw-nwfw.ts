import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_networkfirewall as nwfw,
} from 'aws-cdk-lib'
import { Construct } from 'constructs';

export class SharedVpcWithNwfw extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly nwfwEndpointIds: string[] = [];
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const MY_SHARED_VPC_TGW_VPN_CIDR = process.env.MY_SHARED_VPC_TGW_VPN_CIDR || "10.90.0.0/16";
    this.vpc = new ec2.Vpc(this, 'DemoSharedVpcTgwNfwf', {
      ipAddresses: ec2.IpAddresses.cidr(MY_SHARED_VPC_TGW_VPN_CIDR),
      maxAzs: 3,
      natGateways: 2, // TODO 状況に応じて 1~3 のどれか
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public', // privateA に向けたトラフィックは NWFW endpoint へのルートを設定する
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 28,
          name: 'nwfw', // 0.0.0.0 に向けたトラフィックは NAT Gateway へのルートを設定する
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
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

    // TODO 0.0.0.0/0 -> port:80 を許可する SG を作成


    /* Network Firewall 関連のリソースを作成、2022/10 現在では L2 Construct がないため、L1 Construct (CfnXXX) を利用 */
    const nwfwPolicy = new nwfw.CfnFirewallPolicy(this, 'DemoNwfwPolicy', {
      firewallPolicyName: 'demoNwfwPolicy',
      // 具体的なルールは作成していないが、必要に応じて作成して良い
      // ひとまずステートフルへも流すようにしておく
      firewallPolicy: {
        statelessDefaultActions: ["aws:forward_to_sfe"],
        statelessFragmentDefaultActions: ["aws:forward_to_sfe"]
      }
    });

    const fw = new nwfw.CfnFirewall(this, 'DemoNwfw', {
      firewallName: 'demoNwfw',
      vpcId: this.vpc.vpcId,
      // Shared VPC の Network Firewall endpoint 用に作成したサブネットを割り当てる
      subnetMappings: [
        // TODO AZ は固定で 3 つにしているので、動的に変更する場合はここの処理も
        {subnetId: this.vpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets[0].subnetId},
        {subnetId: this.vpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets[1].subnetId},
        {subnetId: this.vpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets[2].subnetId},
      ],
      firewallPolicyArn: nwfwPolicy.attrFirewallPolicyArn
    });

    // "us-west-2c:vpce-XXXX" のような形式から vpce-XXXX だけ抜き出す
    //   doc) CfnFirewall.attrEndpointIds: For example: `["us-west-2c:vpce-111122223333", "us-west-2a:vpce-987654321098", "us-west-2b:vpce-012345678901"]`
    // しかしこの時点ではデプロイされていないので ID が確定していないため、console.error(fw.attrEndpointIds); しても [ '#{Token[TOKEN.xxx]}' ] となってしまっていて、Route に渡すための vpce-XXX の値を取り出せない
    // Fn.select などを利用すると、値ではなく参照を利用してデプロイ時に動的に処理をするため抜き出せる (可読性は下がるがここは仕方ない)
    this.vpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets.forEach((subnet, i) => {
      this.nwfwEndpointIds.push(cdk.Fn.select(
        1,
        cdk.Fn.split(
          ":",
          cdk.Fn.select(i, fw.attrEndpointIds) // TODO AZ が同じのをConditionで取得
        )
      ));
    });
    // console.error(nwfwEndpointIds[0]);

    // TODO public サブネットから privateAへのルートは Network Firewall endpoint のルートを追加
    this.vpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach((subnet, i) => {
      this.vpc.selectSubnets({subnetGroupName: 'privateA'}).subnets.forEach((privateSubnet, j) => {
        subnet.node.children.push(new ec2.CfnRoute(this, 'PublicFwRoute' + i + j, {
          routeTableId: subnet.routeTable.routeTableId,
          destinationCidrBlock: privateSubnet.ipv4CidrBlock, // TODO privateA サブネットの CIDR を取得したいが、愚直に各サブネットごとにやるしかない？
          vpcEndpointId: this.nwfwEndpointIds[i] // TODO nwfw の subnetMappings と同じ順でAZが同じになるはずという前提
        }));
      });
    });

    // privateA サブネットから 0.0.0.0 へは Network Firewall endpoint のルートを追加
    this.vpc.selectSubnets({subnetGroupName: 'privateA'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'PrivateFwRoute' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: '0.0.0.0/0',
        vpcEndpointId: this.nwfwEndpointIds[i] // TODO nwfw の subnetMappings と同じ順でAZが同じになるはずという前提
      }));
    });
  }
}