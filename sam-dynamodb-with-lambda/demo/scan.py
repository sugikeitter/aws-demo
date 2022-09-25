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


def scan_and_print_result(table, ConsistentRead=False, Limit=5):
    response = table.scan(
        ConsistentRead=ConsistentRead, # True/False
        Limit=Limit,
        ReturnConsumedCapacity='TOTAL'
    )
    if ('LastEvaluatedKey' in response):
        response.pop('LastEvaluatedKey')
    response.pop('ResponseMetadata')
    response.pop('Count')

    # print('---DynamoDB row response---')
    # print(response)
    print('---DynamoDB Result---')
    print('ConsistentRead=' + str(ConsistentRead) + ', Limit=' + str(Limit))
    print('---------------------')
    print(json.dumps(response, indent=2, default=ddb_serializer, ensure_ascii=False))
    
    summary = 'ConsistentRead: {}, Limit: {}\n↓\nScannedCount: {}, ConsumedCapacity: {}\n'.format(
        str(ConsistentRead), str(Limit), response['ScannedCount'] , response['ConsumedCapacity']['CapacityUnits'])

    return summary


if __name__ == '__main__':
    dynamodb_resource = boto3.resource('dynamodb')
    table = dynamodb_resource.Table('comic')
    summary1 = scan_and_print_result(table, ConsistentRead=False, Limit=3)
    summary2 = scan_and_print_result(table, ConsistentRead=True, Limit=3)
    summary3 = scan_and_print_result(table, ConsistentRead=True, Limit=50) # more than item count in table
    
    print('\n===Result Summary===')
    print(summary1)
    print(summary2)
    print(summary3)
