from datetime import datetime, timedelta, timezone
import json
import os

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
  <form action="/{ApigwStage}/asyncLightRequest" method="POST">
    <div class="post">
      <div class="inputTxt">
        <input id="name" type="text" name="name" placeholder="Name" maxlength="12">
      </div>
      <div class="submitButton">
        <input type="submit" value="Send (非同期)" class="sendButton">
      </div>
    </div>
  </form>
  <form action="/{ApigwStage}/syncRequest" method="POST">
    <div class="post">
      <div class="inputTxt">
        <input id="name" type="text" name="name" placeholder="Name" maxlength="12">
      </div>
      <div class="submitButton">
        <input type="submit" value="Send (同期)" class="sendButton">
      </div>
    </div>
  </form>
  {RecieveIds}
</body>
</html>
"""

style = """
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

.post{
	position:relative;
    width:400px;
}
.post .inputTxt{
	margin-right:105px;
	padding:8px;
	background-color:#fff;
	border:1px solid #aaa;
}
.post .inputTxt input{
	width:100%;
	height:24px;
	line-height:24px;
	background:none;
	border:none;
}
.post .submitButton{
	position:absolute;
	top:0;
	right:0;
}
.post .submitButton .sendButton{
	display:block;
	width:100px;
	height:42px;
	color:#fff;
	line-height:40px;
	text-align:center;
	background-color:#009879;
	border:1px solid #c66;
}
"""


"""
トップページとして、受付IDの一覧を返す
"""
def lambda_handler(event, context):
    JST = timezone(timedelta(hours=+9), 'JST')
    timestamp = datetime.now(JST).isoformat()[0:23] # 日本時間のミリ秒3桁までの文字列
    res = table.query(
        KeyConditionExpression=Key('id').eq(timestamp[0:10]),
        ScanIndexForward=False,
        Limit=50,
    )
    print('query timestamp: ' + timestamp)

    recieveIdsHtml = """
    <table class="styled-table">
    <tr>
      <th>受付ID</th><th>名前</th><th>受付時間</th><th>処理時間</th>
    </tr>
    """
    for ddbItems in res.get('Items', []):
        recieveIdsHtml += "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>".format(
            ddbItems.get("recieveId", ""),
            ddbItems.get("name", "NO_NEME"),
            ddbItems.get("recieveTime", ""),
            ddbItems.get("processedTime", "")
        )

    recieveIdsHtml += "</table>"

    return {
        "isBase64Encoded": False,
        "statusCode": 200,
        "headers": {
            "content-type": "text/html; charset=utf-8"
        },
        "body": html.format(
            style=style,
            ApigwStage=os.getenv('API_GW_STAGE', 'Dev'),
            RecieveIds=recieveIdsHtml,
        ),
    }
