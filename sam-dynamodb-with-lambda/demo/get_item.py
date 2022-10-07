import json
import boto3
from decimal import Decimal
from boto3.dynamodb.types import Binary
from botocore.config import Config


def ddb_serializer(obj) -> object:
    if isinstance(obj, Decimal):
        if int(obj) == obj:
            return int(obj)
        else:
            return float(obj)
    elif isinstance(obj, Binary):
        return obj.value
    elif isinstance(obj, bytes):
        return obj.decode()
    elif isinstance(obj, set):
        return list(obj)
    try:
        return str(obj)
    except Exception:
        return None

def get_item_and_print_result(table, Key, ConsistentRead):
    response = table.get_item(
        Key=Key,
        ConsistentRead=ConsistentRead, # True/False
        ReturnConsumedCapacity='TOTAL'
    )
    response.pop('ResponseMetadata')
    # for learge item trim
    if response.get('Item', {}).get('largeMessage', False):
        response.get('Item', {}).update({'largeMessage': '吾輩わがはいは猫である。名前はまだ無い〜〜〜'})

    # print('---DynamoDB row response---')
    # print(response)
    print('---DynamoDB Result---')
    print('ConsistentRead=' + str(ConsistentRead))
    print('---------------------')
    print(json.dumps(response, indent=2, default=ddb_serializer, ensure_ascii=False))

if __name__ == '__main__':
    dynamodb_resource = boto3.resource('dynamodb')
    table = dynamodb_resource.Table('comic')
    get_item_and_print_result(table, Key={'title': 'ドラゴンボール', 'volume': '1'}, ConsistentRead=False)
    get_item_and_print_result(table, Key={'title': 'ドラゴンボール', 'volume': '1'}, ConsistentRead=True)
    
    # get learge item
    table = dynamodb_resource.Table('demoThrottling')
    get_item_and_print_result(table, Key={'id': '002'}, ConsistentRead=False)
    get_item_and_print_result(table, Key={'id': '002'}, ConsistentRead=True)
    
