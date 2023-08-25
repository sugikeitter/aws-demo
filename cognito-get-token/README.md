# Cognito でユーザープールから JWT の取得と ID プールから AWS のアクセスキー+セッショントークン取得
![](https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/images/scenario-cup-cib.png)
https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/amazon-cognito-integrating-user-pools-with-identity-pools.html

🚨 通常はパスワードや認証情報は公開しないようにしてください 🚨

## 準備
- Cognito のユーザープールと ID プールを作成

- トークン取得に必要な AWS リソースの ID を環境変数に設定
```bash
# トークン取得に必要な AWS リソースの ID を環境変数に設定
DEMO_USER_POOL_ID=ap-northeast-1_xxxxxxx
DEMO_APP_CLIENT_ID=yyyyyyyyyyyyyyyyyyyyyyyyyy
DEMO_IDENTITY_POOL_ID=ap-northeast-1:zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz
```

- **ユーザー未登録の場合のみ** ユーザープールにユーザーを登録 / <YOUR_USER_NAME> と <YOUR_USER_PASSWORD> は各自で設定
```bash
aws cognito-idp admin-set-user-password --user-pool-id ${DEMO_USER_POOL_ID} --username <YOUR_USER_NAME> --password <YOUR_USER_PASSWORD> --permanent
```

## Cognito のユーザープールから JWT を取得 (登録ユーザーのユーザー名+パスワードを使用)
![](https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/images/cognito-user-pool-auth-flow-srp.png)
https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow.html
- 今回は `USER_PASSWORD_AUTH` を使用するため、`InitiateAuth` のみで JWT を取得する
  - *`USER_PASSWORD_AUTH` はパスワードをネットワーク経由で送るため、通常は使用しないこと* ※今回はわかりやすいのであえて使用
```bash
# 登録済みのユーザー名 & パスワード で認証の API を使用すると JWT 形式の IdToken, AccessToken, RefretshToken が取得できる
COGNITO_INITIATE_AUTH_RESPONSE=`curl -s -w'\n' 'https://cognito-idp.ap-northeast-1.amazonaws.com/' \
-X POST \
-H 'Content-Type: application/x-amz-json-1.1' \
-H 'X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth' \
--data-raw "
{
    \"ClientId\": \"${DEMO_APP_CLIENT_ID}\",
    \"AuthFlow\": \"USER_PASSWORD_AUTH\",
    \"AuthParameters\":
    {
        \"USERNAME\": \"sugimoto\",
        \"PASSWORD\": \"Sugimoto?\"
    }
}"`

# 取得内容を出力
echo $COGNITO_INITIATE_AUTH_RESPONSE | jq

# IdToken の部分だけ抽出
COGNITO_ID_TOKEN=`echo $COGNITO_INITIATE_AUTH_RESPONSE | awk -F\" '{print $12}'`
echo $COGNITO_ID_TOKEN
```

- https://jwt.io/ で `$COGNITO_ID_TOKEN` を検証

## Cognito の ID プールから IAM ロールの認証情報を取得 (Cognito ユーザープールから取得した `IdToken` を使用)

![](https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/images/amazon-cognito-ext-auth-enhanced-flow.png)
https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/authentication-flow.html

- GetId と GetCredentialsForIdentity の 2 つの API が必要
```bash
# IDプールのGetId エンドポイントのURLはcognito-identity
COGNITO_GET_ID_RESPONSE=`curl -s -w'\n' 'https://cognito-identity.ap-northeast-1.amazonaws.com/' \
-X POST \
-H 'Content-Type: application/x-amz-json-1.1' \
-H 'X-Amz-Target: com.amazonaws.cognito.identity.model.AWSCognitoIdentityService.GetId' \
-d "
{
   \"IdentityPoolId\": \"${DEMO_IDENTITY_POOL_ID}\",
   \"Logins\": {
      \"cognito-idp.ap-northeast-1.amazonaws.com/${DEMO_USER_POOL_ID}\" : \"${COGNITO_ID_TOKEN}\"
   }
}"`

# 取得内容を出力
echo $COGNITO_GET_ID_RESPONSE | jq

# 取得内容から GetCredentialsForIdentity に必要な部分を抜き出す
COGNITO_IDENTITY_ID=`echo $COGNITO_GET_ID_RESPONSE | awk -F\" '{print $4}'`

# GetCredentialsForIdentityでIAMロールの認証情報を取得
IAM_ROLE_CRED=`curl -s -w'\n' 'https://cognito-identity.ap-northeast-1.amazonaws.com/' \
-X POST \
-H 'Content-Type: application/x-amz-json-1.1' \
-H 'X-Amz-Target: com.amazonaws.cognito.identity.model.AWSCognitoIdentityService.GetCredentialsForIdentity' \
-d "
{
   \"IdentityId\": \"${COGNITO_IDENTITY_ID}\",
   \"Logins\": {
      \"cognito-idp.ap-northeast-1.amazonaws.com/${DEMO_USER_POOL_ID}\" : \"${COGNITO_ID_TOKEN}\"
   }
}"`

# 取得内容を出力
echo $IAM_ROLE_CRED | jq
```

```bash
### CLI ###
# ID プールの GetId で、IdentityId を取得（結果の参照）
aws cognito-identity get-id --identity-pool-id ${DEMO_IDENTITY_POOL_ID} --logins "{\"cognito-idp.ap-northeast-1.amazonaws.com/${DEMO_USER_POOL_ID}\":\"${COGNITO_ID_TOKEN}\"}" --output json | jq

# IDプールのAPIのGetIdで、IdentityIdを取得（環境変数に必要な値だけ保存）
COGNITO_IDENTITY_ID=`aws cognito-identity get-id --identity-pool-id ${DEMO_IDENTITY_POOL_ID} --logins "{\"cognito-idp.ap-northeast-1.amazonaws.com/${DEMO_USER_POOL_ID}\":\"${COGNITO_ID_TOKEN}\"}" --output text --query 'IdentityId'`

# GetCredentialsForIdentity で IAM ロールの認証情報を取得
# *IAM ロールの認証情報は原則後悔しないこと*
aws cognito-identity get-credentials-for-identity --identity-id ${COGNITO_IDENTITY_ID} --logins "{\"cognito-idp.ap-northeast-1.amazonaws.com/${DEMO_USER_POOL_ID}\":\"${COGNITO_ID_TOKEN}\"}"
```
