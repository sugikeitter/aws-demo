## Library update command
```bash
# npm update (using nvm)
nvm install --lts
nvm alias default node
```

```bash
# global CDK CLI version up (https://www.npmjs.com/package/aws-cdk)
npm install -g aws-cdk@X.Y.Z

# package.json update for aws-cdk-lib and aws-cdk
## https://www.npmjs.com/package/aws-cdk-lib
## https://www.npmjs.com/package/aws-cdk
npm install aws-cdk@X.Y.Z aws-cdk-lib@Z.Y.X
```

## Build & Deoploy commands

```bash
# deploy this stack to your default AWS account/region
AWS_ACCOUNT_ID=<YOUR_ACCOUNT_ID> cdk deploy [--profile <YOUR_PROFILE_NAME>] <YOUR_STACK_NAME>
# compare deployed stack with current state
AWS_ACCOUNT_ID=<YOUR_ACCOUNT_ID> cdk diff [--profile <YOUR_PROFILE_NAME>] <YOUR_STACK_NAME>
#  emits the synthesized CloudFormation template
AWS_ACCOUNT_ID=<YOUR_ACCOUNT_ID> cdk synth [--profile <YOUR_PROFILE_NAME>] <YOUR_STACK_NAME>

# Option
MAX_AZS=[2, 3]
AWS_REGION=[ap-northeast-1, ap-northeast-3, us-west-2]

# 3 つの VPC と Transit Gateway をデプロイする場合
AWS_ACCOUNT_ID=<YOUR_ACCOUNT_ID> cdk deploy CdkDemoVpcs

# ALB + EC2/ECS のアプリケーションをデプロイする場合 (事前に CodeCommit/ECR/ACM/Route 53 などの準備が必要)
AWS_ACCOUNT_ID=<YOUR_ACCOUNT_ID> cdk deploy CdkDemoApps
```
The `cdk.json` file tells the CDK Toolkit how to execute your app.

# Overview Network
![](https://raw.githubusercontent.com/sugikeitter/aws-demo/main/cdk-multi-vpcs/cdk-multi-vpcs-overview.drawio.svg)
<!--
# Overview ALB + EC2 + RDS
![](https://raw.githubusercontent.com/sugikeitter/aws-demo/main/cdk-sharedvpc-tgw-vpnvpc/cdk-sharedvpc-tgw-vpnvpc-Overview-ALB-EC2-in-Shared-VPC.drawio.svg)

# Overview ALB + ECS
![](https://raw.githubusercontent.com/sugikeitter/aws-demo/main/cdk-sharedvpc-tgw-vpnvpc/cdk-sharedvpc-tgw-vpnvpc-Overview-ALB-ECS-in-Shared-VPC.drawio.svg)
-->

<!--
## 学んだこと
### RouteTable に Route を追加したい場合、`node` を利用
- https://docs.aws.amazon.com/cdk/api/v2/docs/constructs.Node.html
```typescript
// Network Firewall 作成
const fw = new nwfw.CfnFirewall(this, 'DemoNwfw', {
  firewallName: 'demoNwfw',
  vpcId: this.vpc.vpcId,
  subnetMappings: [
    {subnetId: this.vpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets[0].subnetId},
    {subnetId: this.vpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets[1].subnetId},
    {subnetId: this.vpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets[2].subnetId},
  ],
  firewallPolicyArn: nwfwPolicy.attrFirewallPolicyArn
});

---
// privateA サブネットから 0.0.0.0 へは Network Firewall endpoint のルートを追加
this.vpc.selectSubnets({subnetGroupName: 'privateA'}).subnets.forEach((subnet, i) => {
  subnet.node.children.push(new ec2.CfnRoute(this, 'PrivateToNwFw' + i, {
    routeTableId: subnet.routeTable.routeTableId,
    destinationCidrBlock: '0.0.0.0/0',
    vpcEndpointId: this.nwfwEndpointIds[i] // TODO nwfw の subnetMappings と同じ順でAZが同じになるはずという前提
  }));
});


## DEBUG
{CONSTRUCT}.node.children.forEach((child) => {
  if (child instanceof ec2.CfnInstance) {
    console.erro(child);
  }
});

const c = {CONSTRUCT}.node.children.find((child) => child instanceof ec2.CfnLaunchTemplate) as ec2.CfnLaunchTemplate;
console.error(c['cfnProperties']); // c['_cfnProperties'] と同じ？
```

### `cdk synth` 時点 (deploy が完了するまで) は決定しない値を操作したい場合は `Fn::select` や `Fn::split` が必要
```typescript
// この時点では fw.attrEndpointIds はデプロイされていないので決まっていない
//  そのため fw.attrEndpointIds[0] -> {Token} のような一時的なポインタみたいなもの？が入っていてstringとして扱えないため、
//  fw.attrEndpointIds[0].substring(subnet.availabilityZone.length + 1, fw.attrEndpointIds[0].length) のような処理はできない
this.vpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets.forEach((subnet, i) => {
  this.nwfwEndpointIds.push(cdk.Fn.select(
    1,
    cdk.Fn.split(
      ":",
      cdk.Fn.select(i, fw.attrEndpointIds) // TODO AZ が同じのをConditionで取得
    )
  ));
});
```
### constructA.node.addDependency(constructB)
- Stack ではなく Construct の依存関係を設定したい場合は `node` を挟む
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib-readme.html

### Transit Gateway が作成完了するまでに id 利用する場合、NotFound になる？
- リソース作成完了待ちが必要
- VPC 側のルートを Construct ではなく、既存リソースに注入しているため暗黙的な依存関係が発生しないため、Construct を分けて依存関係設定が必要

### ec2.SubnetSelection をスタック参照の VPC のサブネット指定で利用すると `Cross stack references are only supported for stacks deployed to the same environment or between nested stacks and their parent stack` のエラーになる

こちらのように elb.ApplicationLoadBalancer を new する時の vpc 指定と vpcSubnets 指定があるが、この時に気をつける必要がある
```typescript
    const albSubnets: ec2.SubnetSelection = {
      subnetType: ec2.SubnetType.PUBLIC,
    };

    const alb = new elb.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: "DemoAlb",
      vpc: props.vpc, // 別 Stack の VPC
      vpcSubnets: albSubnets, // 上で用意した PUBLIC の ec2.SubnetSelection だとエラー
      // props.vpc.selectSubnets({subnetGroupName: 'public(ここは自分で決めた subnet の名前)'}), のようにしないといけない
      internetFacing: true,
      securityGroup: albSg
    });
```

### Stack分割すると参照が辛く、RDSのStackで、dbClientSg→dbServerSg を用意して、ec2のStackにdbClientSgを渡してLaunchTemplateに利用してもらうのが辛い
LaunchTemplate に SG を紐づけると、CDK が LaunchTemplate と連携する ALB のルールも追加しようとしてくれるから、別Stackから持ってきたSGにALBのルールを追加しようとして循環参照になる
-->

