import os

import boto3

ddb_resource = boto3.resource('dynamodb', region_name='ap-northeast-1')

tbl_book = ddb_resource.Table('book')

with tbl_book.batch_writer() as batch:
  batch.put_item(Item={
      'title': '達人に学ぶDB設計 徹底指南書',
      'author': 'ミック',
      'publisher': '翔泳社',
      'releaseDate': '2012/03/15',
  })
  batch.put_item(Item={
      'title': 'リーダブルコード ―より良いコードを書くためのシンプルで実践的なテクニック',
  })
  batch.put_item(Item={
      'title': 'Effective Java 第3版',
      'author': 'ジョシュア・ブロック',
      'releaseDate': '2018/10/30',
  })
  batch.put_item(Item={
      'title': 'マスタリングTCP/IP　入門編（第6版）',
      'author': [
        '井上直也',
        '村山公保',
        '竹下隆史',
        '荒井透',
        '苅田幸雄'
      ],
  })

### comic
tbl_comic = ddb_resource.Table('comic')

with tbl_comic.batch_writer() as batch:
  # ゴルゴ13
  title = 'ゴルゴ13'
  author = 'さいとう・たかを'
  for i in range(1, 6):
    item = {
        'title': title,
        'volume': str(i+8),
        'author': author,
        'releaseDate': '201' + str(i) + '/04/01',
    }
    if i % 2 == 0:
      item['sale'] = 'Y'
    batch.put_item(Item=item)
    
  # こち亀
  title = 'こち亀'
  author = '秋本治'
  for i in range(1, 8):
    item = {
        'title': title,
        'volume': str(i),
        'author': author,
        'releaseDate': '201' + str(i+2) + '/04/01',
    }
    if i % 3 == 0:
      item['sale'] = 'Y'
    batch.put_item(Item=item)

  # ドラゴンボール
  title = 'ドラゴンボール'
  author = '鳥山明'
  for i in range(1, 5):
    item = {
        'title': title,
        'volume': str(i),
        'author': author,
        'releaseDate': '201' + str(i+4) + '/04/01',
    }
    if i in range(1, 4):
      item['sale'] = 'Y'
    batch.put_item(Item=item)


tbl_throttling = ddb_resource.Table('demoThrottling')
tbl_throttling.put_item(Item={
    'id': '001',
    'message': 'Hello, World!!'
})

largeMessage = ''
with open(os.path.dirname(__file__) + '/largeMessage.txt') as f:
    largeMessage = f.read()

tbl_throttling.put_item(Item={
    'id': '002',
    'largeMessage': largeMessage
})
