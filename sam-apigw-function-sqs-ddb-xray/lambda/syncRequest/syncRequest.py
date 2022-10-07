from datetime import datetime, timedelta, timezone
import base64
import json
import os
import time
import uuid

import boto3
from boto3.dynamodb.conditions import Key

from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core import patch_all

patch_all()

ddb_resource = boto3.resource("dynamodb")
table = ddb_resource.Table(os.environ['DDB_TABLE_NAME'])

html = """
<!DOCTYPE html>
<html>
<head>
  <style>
    {style}
  </style>
</head>
<body>
  <div class="top">
    {TopMsg}
    <a href="/{ApigwStage}">トップへ</a>
  </div>
  {RecieveIds}
</body>
</html>
"""

style = """
.top {
    font-family: 'Liberation Serif', 'Noto Sans CJK JP',  /* Linux/Android/ChromeOS */
                 'TakaoGothic', 'VL Gothic',  /* Debian/Ubuntu */
                 'Yu Gothic', 'MS Gothic',  /* Windows */
                 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Osaka-Mono',  /* Mac/iOS */
                 'Noto Sans JP', Monospace;
}

.recieveId {
    color: #009879;
}

.styled-table {
    border-collapse: collapse;
    margin: 25px 0;
    font-size: 0.9em;
    font-family: 'Liberation Serif', 'Noto Sans CJK JP',  /* Linux/Android/ChromeOS */
                 'TakaoGothic', 'VL Gothic',  /* Debian/Ubuntu */
                 'Yu Gothic', 'MS Gothic',  /* Windows */
                 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Osaka-Mono',  /* Mac/iOS */
                 'Noto Sans JP', Monospace;
    min-width: 400px;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);
}

.styled-table thead tr {
    background-color: #009879;
    color: #ffffff;
    text-align: left;
}

.styled-table th,
.styled-table td {
    padding: 12px 15px;
}

.styled-table tbody tr {
    border-bottom: 1px solid #dddddd;
}

.styled-table tbody tr:nth-of-type(even) {
    background-color: #f3f3f3;
}

.styled-table tbody tr:last-of-type {
    border-bottom: 2px solid #009879;
}

.styled-table tbody tr.active-row {
    font-weight: bold;
    color: #009879;
}
"""

"""
API Gateway(HTTP)からPOSTリクエストを受けて、現在時刻とPOSTに入ってるパラメータをSQSキューに送る
"""
def lambda_handler(event, context):

    # POSTのテキスト(name=XXX)を取得
    print(event)
    body = event.get('body', 'name=NO_NAME') # 'bmFtZT1OT19OQU1F'をdecodeすると'name=NO_NAME'
    print(body)
    # decodedBody = base64.b64decode(body).decode() # HTTP APIはデフォルト設定だとPOSTのbodyがAPIGWでencodeされてるのでdecode
    # print(decodedBody)
    name = body.split('=')[1][0:12] # bodyは空文字でもname=''がくる前提
    if name.startswith('4'):
        print("[ERROR] 400 Bad Request, name={n}".format(n=name))
        return response_html(
            400,
            '<h1>400 Bad Request</h1>',
            ''
        )
    elif name.startswith('5'):
        print("[ERROR] 500 Internal Server Error, name={n}".format(n=name))
        return response_html(
            500,
            '<h1>500 Internal Server Error</h1>',
            ''
        )
    elif name == "":
        name = 'NO_NAME'

    JST = timezone(timedelta(hours=+9), 'JST')
    recieveTime = datetime.now(JST).isoformat()[0:23] # 日本時間のミリ秒3桁までの文字列
    yearAndDate = recieveTime[0:10]
    recieveId = uuid.uuid4().hex # ランダムな文字列

    time.sleep(7) # 時間のかかる処理の想定
    JST = timezone(timedelta(hours=+9), 'JST')
    processedTime = datetime.now(JST).isoformat()[0:23] # 日本時間のミリ秒3桁までの文字列
 
    res = table.put_item(
        Item={
            'id': recieveTime[0:10],
            'recieveTime': recieveTime,
            'recieveId': recieveId,
            'name': name,
            'processedTime': processedTime,
        })

    print("--PutItem Response: " + recieveId)
    print(res)

    print("--TRACE_ID--")
    print(os.getenv("_X_AMZN_TRACE_ID"))


    # DynamoDBの直近数件をQuery
    JST = timezone(timedelta(hours=+9), 'JST')
    timestamp = datetime.now(JST).isoformat()[0:23] # 日本時間のミリ秒3桁までの文字列
    res = table.query(
        KeyConditionExpression=Key('id').eq(yearAndDate),
        ScanIndexForward=False,
        Limit=10,
        ConsistentRead=True
    )
    print('query timestamp: ' + timestamp)
    recieveIdsHtml = """
    <table class="styled-table">
    <tr>
      <th>受付ID</th><th>名前</th><th>受付時間</th><th>処理時間</th>
    </tr>
    """
    for ddbItems in res.get('Items', []):
        rcvId = ddbItems.get("recieveId", "")
        if rcvId == recieveId:
            rcvId = '<span class="recieveId">'+rcvId+'</span>'

        recieveIdsHtml += "<tr><th>{}</th><th>{}</th><th>{}</th><th>{}</th></tr>".format(
            rcvId,
            ddbItems.get("name", "NO_NEME"),
            ddbItems.get("recieveTime", ""),
            ddbItems.get("processedTime", "")
        )

    recieveIdsHtml += "</table>"
    return response_html(
        200,
        '<p>申し込みを受け付けました👍</p><p>受付ID: <span class="recieveId">'+recieveId+'</span></p>',
        recieveIdsHtml
    )

def response_html(status_code, msg, recieveIdsHtml):
    return {
        "isBase64Encoded": False,
        "statusCode": status_code,
        "headers": {
            "content-type": "text/html; charset=utf-8"
        },
        "body": html.format(
            style=style,
            ApigwStage=os.getenv('API_GW_STAGE', 'Dev'),
            TopMsg=msg,
            RecieveIds=recieveIdsHtml
        ),
    }
