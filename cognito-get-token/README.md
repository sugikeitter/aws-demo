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
```bash
# 登録済みのユーザー名 & パスワード で認証の API を使用すると JWT 形式の IdToken, AccessToken, RefretshToken が取得できる
# *USER_PASSWORD_AUTH は通常は使用しないこと*
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

TODO 画像

## Cognito の ID プールから IAM ロールの認証情報を取得 (Cognito ユーザープールから取得した `IdToken` を使用)
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
      \"cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_wq99ovcoE\" : \"${COGNITO_ID_TOKEN}\"
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
      \"cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_wq99ovcoE\" : \"${COGNIT_ID_TOKEN}\"
   }
}"`

# 取得内容を出力
echo $IAM_ROLE_CRED | jq
```

