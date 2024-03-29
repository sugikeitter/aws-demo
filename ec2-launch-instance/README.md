## 全体図
![](https://raw.githubusercontent.com/sugikeitter/aws-demo/main/ec2-launch-instance/demo-launch-ec2-instance-_Level2_.drawio.svg)

## 手順
- EC2 インスタンスを起動
  - パブリックIPを有効
  - セキュリティグループで0.0.0.0からポート80番のアクセスを許可したものを適用
  - Systems Manager のマネージドインスタンスに必要なポリシーを付与した IAM ロールを紐づける
- インスタンスが起動したら接続して、以下のコマンドを実行して簡易的な Web アプリを起動
```bash
sudo su ec2-user
cd && curl https://raw.githubusercontent.com/sugikeitter/golang__http-server-on-aws/main/bin/go-http-linux > httpServer
chmod 755 httpServer
nohup sudo ./httpServer 80 &
# nohup ./httpServer 8080 & # Not use sudo
```

## 全体図（簡略 Ver.）
![](https://raw.githubusercontent.com/sugikeitter/aws-demo/main/ec2-launch-instance/demo-launch-ec2-instance-_Level1_.drawio.svg)
