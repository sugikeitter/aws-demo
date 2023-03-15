## IMDSv1
```bash
# メタデータのリスト取得
curl -s -w'\n\n' http://169.254.169.254/latest/meta-data/

# InstanceProfileのArn取得（パスを`/iam/security-credentials/<ROLE_NAME>`にすると、アクセスキーやIAMロールで利用するトークンが取得できてる）
curl -s -w'\n\n' http://169.254.169.254/latest/meta-data/iam/info/
```

## IMDSv2
```bash
# TTLを指定したv2用のトークンをPUTメソッドで取得
TOKEN=`curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 600"`

# トークンを利用してメタデータのリスト取得
curl -s -w'\n\n' -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/

# トークンを利用してInstanceProfileのArn取得
curl -s -w'\n\n' -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/info/
```

## 結果のサンプル
```bash
# IMDSv1 で AWS クレデンシャルの取得（実際の結果は他人には見せるのは NG）
$ curl -s -w'\n\n' http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRoleName
{
    "Code": "Success",
    "LastUpdated": "2023-01-01T22:55:59Z",
    "Type": "AWS-HMAC",
    "AccessKeyId": "AKIAI44QH8DHBEXAMPLE",
    "SecretAccessKey": "je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY",
    "Token": "AQoEXAMPLEH4aoAH0gNCAPyJxz4BlCFFxWNE1OPTgk5TthT+FvwqnKwRcOIfrRh3c/LTo6UDdyJwOOvEVPvLXCrrrUtdnniCEXAMPLE/IvU1dYUg2RVAJBanLiHb4IgRmpRV3zrkuWJOgQs8IZZaIv2BXIa2R4OlgkBN9bkUDNCJiBeb/AXlzBBko7b15fjrBs2+cTQtpZ3CYWFXG8C5zqx37wnOE49mRl/+OtkIKGO7fAE",
    "Expiration": "2023-01-01T23:55:59Z"
}
```

## 参考リンク
- [Instance metadata and user data - Amazon Elastic Compute Cloud](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html)
- [SSRF攻撃によるCapital Oneの個人情報流出についてまとめてみた - piyolog](https://piyolog.hatenadiary.jp/entry/2019/08/06/062154)
- [SSRF対策としてAmazonから発表されたIMDSv2の効果と限界 | 徳丸浩の日記](https://blog.tokumaru.org/2019/12/defense-ssrf-amazon-ec2-imdsv2.html)
