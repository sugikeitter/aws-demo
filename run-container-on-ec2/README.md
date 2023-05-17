## 事前準備 (初回のみ)
- EC2 インスタンスを Amazon Linux2 で起動
  - Session Manager でインスタンスに接続できるようにしておく
  - インバウンドで 80 番ポートを 0.0.0.0/0 からアクセスできるようにしておく (Security Group, パブリック IP など)
- インスタンスへ接続し、[Amazon Linux2 に Docker をインストール](https://docs.aws.amazon.com/ja_jp/AmazonECS/latest/developerguide/create-container-image.html)
```bash
# Amazon Linux 2
sudo yum update -y
sudo amazon-linux-extras install docker -y
sudo systemctl start docker
sudo usermod -a -G docker ec2-user
sudo systemctl enable docker
```

```bash
# Amazon Linux 2023
sudo su ec2-user
sudo dnf update -y
sudo dnf install docker -y
sudo systemctl start docker
sudo usermod -a -G docker ec2-user
sudo systemctl enable docker
exit # 一度シェルからログアウト
sudo su ec2-user
docker ps
```

## デモ実施前作業
- 念の為 docker を起動
```bash
sudo systemctl start docker
```
- キャッシュを利用しないように今あるコンテナイメージの削除と、今動いてるコンテナを全て削除
```bash
sudo su ec2-user
docker stop `docker ps -a | sed '1d' | awk '{print $1}'`
docker rm `docker ps -a | sed '1d' | awk '{print $1}'`
docker rmi `docker images | sed '1d' | awk '{print $1 ":" $2}' | grep -v "<none>"`
docker rmi `docker images | sed '1d' | awk '{print $3}'`
```

## デモ 
- Amazon ECR パブリックギャラリー (https://gallery.ecr.aws/) から Ubunts で Nginx コンテナイメージをダウンロードして起動
  - ホストマシンのポート 80 番でコンテナ上の Nginx で接続できるようにする
```bash
# https://gallery.ecr.aws/ubuntu/nginx
docker run -d --name nginx-container -e TZ=UTC -p 80:80 public.ecr.aws/ubuntu/nginx:latest
```

- ホストマシンからコンテナ上の Nginx へ接続確認
```bash
curl localhost:80
```
