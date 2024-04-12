import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_networkfirewall as nwfw,
} from 'aws-cdk-lib'
import { Construct } from 'constructs';

export class SharedVpcWithNwfw extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly nwfwEndpointIds: string[] = [];
  constructor(scope: Construct, id: string, maxAzs: number, vpcCidr: string) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      maxAzs: maxAzs,
      natGateways: maxAzs,
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

    /* Network Firewall 関連のリソースを作成、2024/04 現在では L2 Construct がないため、L1 Construct (CfnXXX) を利用 */
    const nwfwPolicy = new nwfw.CfnFirewallPolicy(this, 'DemoNwfwPolicy', {
      firewallPolicyName: 'demo-NwfwPolicy',
      // 具体的なルールは作成していないが、必要に応じて作成して良い
      // ひとまずステートフルへも流すようにしておく
      firewallPolicy: {
        statelessDefaultActions: ["aws:forward_to_sfe"],
        statelessFragmentDefaultActions: ["aws:forward_to_sfe"]
      }
    });

    const fw = new nwfw.CfnFirewall(this, 'Nwfw', {
      firewallName: 'demoNwfw',
      vpcId: this.vpc.vpcId,
      // Shared VPC の Network Firewall endpoint 用に作成したサブネットを割り当てる
      subnetMappings: [...Array(maxAzs)].map((_, i) => {
        return {subnetId: this.vpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets[i].subnetId}
      }),
      firewallPolicyArn: nwfwPolicy.attrFirewallPolicyArn
    });

    // "us-west-2c:vpce-XXXX" のような形式から vpce-XXXX だけ抜き出す
    //   doc) CfnFirewall.attrEndpointIds: For example: `["us-west-2c:vpce-111122223333", "us-west-2a:vpce-987654321098", "us-west-2b:vpce-012345678901"]`
    // しかしこの時点ではデプロイされていないので ID が確定していないため、console.error(fw.attrEndpointIds); しても [ '#{Token[TOKEN.xxx]}' ] となってしまっていて、Route に渡すための vpce-XXX の値を取り出せない
    // Fn.select などを利用すると、値ではなく参照を利用してデプロイ時に動的に処理をするため抜き出せる (可読性は下がるがここは仕方ない)
    this.vpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets.forEach((_, i) => {
      this.nwfwEndpointIds.push(cdk.Fn.select(
        1,
        cdk.Fn.split(
          ":",
          cdk.Fn.select(i, fw.attrEndpointIds)
        )
      ));
    });

    // public サブネットから privateAへのルートは Network Firewall endpoint のルートを追加
    this.vpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach((subnet, i) => {
      this.vpc.selectSubnets({subnetGroupName: 'privateA'}).subnets.forEach((privateSubnet, j) => {
        subnet.node.children.push(new ec2.CfnRoute(this, 'PublicToNwFw' + i + j, {
          routeTableId: subnet.routeTable.routeTableId,
          destinationCidrBlock: privateSubnet.ipv4CidrBlock, // TODO privateA サブネットの CIDR を取得したいが、愚直に各サブネットごとにやるしかない？
          vpcEndpointId: this.nwfwEndpointIds[j] // TODO nwfw の subnetMappings と同じ順でAZが同じになるはずという前提
        }));
      });
    });

    // privateA サブネットから 0.0.0.0 へは Network Firewall endpoint のルートを追加
    this.vpc.selectSubnets({subnetGroupName: 'privateA'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'PrivateToNwFw' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: '0.0.0.0/0',
        vpcEndpointId: this.nwfwEndpointIds[i] // TODO nwfw の subnetMappings と同じ順でAZが同じになるはずという前提
      }));
    });
  }
}
