## IMDSv1
```bash
# メタデータのリスト取得
curl http://169.254.169.254/latest/meta-data/

# InstanceProfileのArn取得（パスを`/iam/security-credentials/<ROLE_NAME>`にすると、アクセスキーやIAMロールで利用するトークンが取得できてる）
curl http://169.254.169.254/latest/meta-data/iam/info/
```

## IMDSv2
```bash
# TTLを指定したv2用のトークンをPUTメソッドで取得
TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 600"`

# トークンを利用してメタデータのリスト取得
curl -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/meta-data/

# トークンを利用してInstanceProfileのArn取得
curl -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/meta-data/iam/info/
```

## 参考リンク
- [Instance metadata and user data - Amazon Elastic Compute Cloud](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html)
- [SSRF攻撃によるCapital Oneの個人情報流出についてまとめてみた - piyolog](https://piyolog.hatenadiary.jp/entry/2019/08/06/062154)
