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



tbl_comic = ddb_resource.Table('comic')

with tbl_comic.batch_writer() as batch:

  title = 'ゴルゴ13'
  author = 'さいとう・たかを'
  for i in range(1, 5):
    batch.put_item(Item={
        'title': title,
        'volume': str(i+8),
        'author': author,
        'releaseDate': '201' + str(i) + '/04/01',
    })

  title = 'こち亀'
  author = '秋本治'
  for i in range(1, 7):
    batch.put_item(Item={
        'title': title,
        'volume': str(i+2),
        'author': author,
        'releaseDate': '201' + str(i+2) + '/04/01',
    })

  title = 'ドラゴンボール'
  author = '鳥山明'
  for i in range(1, 4):
    batch.put_item(Item={
        'title': title,
        'volume': str(i),
        'author': author,
        'releaseDate': '201' + str(i+4) + '/04/01',
    })