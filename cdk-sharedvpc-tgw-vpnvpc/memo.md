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
