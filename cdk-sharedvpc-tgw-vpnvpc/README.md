# Overview Network
![](https://raw.githubusercontent.com/sugikeitter/aws-demo/main/cdk-sharedvpc-tgw-vpnvpc/cdk-sharedvpc-tgw-vpnvpc-Overview-NATGW-x2.drawio.svg)

# Overview ALB + Target (ECS / ASG + EC2)
![](https://raw.githubusercontent.com/sugikeitter/aws-demo/main/cdk-sharedvpc-tgw-vpnvpc/cdk-sharedvpc-tgw-vpnvpc-Overview-NATGW-x2-ALB-target.drawio.svg)

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

The `cdk.json` file tells the CDK Toolkit how to execute your app.

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

### `cdk synth` 時点 (deploy が完了するまで) は決定しない値を操作したい場合は `Fn::select` や `Fn::split` が必要

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

## TODO
### ApplicationListener の addAction/addTargetGroups/addTargets の違い