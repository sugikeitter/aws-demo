import json
import os

import boto3
from boto3.dynamodb.conditions import Key
from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core import patch_all

patch_all()

ddb_resource = boto3.resource("dynamodb")
table = ddb_resource.Table(os.environ['DDB_TABLE_NAME'])


def lambda_handler(event, context):
    res = table.scan(
            Limit=100
        )
    return {
        "statusCode": 200,
        "body": json.dumps(res['Items'], ensure_ascii=False),
    }
