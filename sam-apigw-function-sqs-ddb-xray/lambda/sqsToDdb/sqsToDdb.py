from datetime import datetime, timedelta, timezone
import json
import os
import time

import boto3

from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core import patch_all

patch_all()

ddb_resource = boto3.resource("dynamodb")
table = ddb_resource.Table(os.environ['DDB_TABLE_NAME'])

"""
SQSキューのイベントからDynamoDBテーブルへItemをputする
"""
def lambda_handler(event, context):
    print("--TRACE_ID--")
    print(os.getenv("_X_AMZN_TRACE_ID"))

    for record in event['Records']:
        if record['eventSource'] == 'aws:sqs':
            print('--record--')
            print(record)

            time.sleep(30) # 時間のかかる処理の想定
            payload = json.loads(record["body"])
            JST = timezone(timedelta(hours=+9), 'JST')
            processedTime = datetime.now(JST).isoformat()[0:23] # 日本時間のミリ秒3桁までの文字列

            # TODO 既にprocessedTime以外がItemとしてputされてる場合のみputする条件更新が必要
            res = table.put_item(
                Item={
                    'id': payload.get("recieveTime", "YYYY-MM-DD")[0:10],
                    'recieveTime': payload.get("recieveTime", ""),
                    'recieveId': payload.get("recieveId", "NO_ID"),
                    'name': payload.get("name", "NO_NAME"),
                    'processedTime': processedTime,
                })

            print("--PutItem Response: " + payload.get("recieveId", "NO_ID"))
            print(res)

    # SQS連携なので、成功したらOKを返すだけ
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "OK",
        }),
    }
