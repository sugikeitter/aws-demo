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
sudo dnf install docker git -y
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
### Amazon ECR パブリックギャラリー (https://gallery.ecr.aws/) から Ubunts で Nginx コンテナイメージをダウンロードして起動
- ホストマシンのポート 80 番でコンテナ上の Nginx で接続できるようにする
```bash
# https://gallery.ecr.aws/ubuntu/nginx
docker run -d --name nginx-container -e TZ=UTC -p 80:80 public.ecr.aws/ubuntu/nginx:latest
```

- ホストマシンからコンテナ上の Nginx へ接続確認
```bash
curl localhost:80
```

### Dockerfile からコンテナイメージをビルドして ECR に push / pull
- ECR にリポジトリを先に作成しておく
```bash
# init #
git clone https://github.com/sugikeitter/golang__http-server-on-aws.git
cd golang__http-server-on-aws

# build #
docker images # コンテナイメージが存在しないことを確認

COMMIT_HASH=`git rev-parse HEAD`; echo $COMMIT_HASH
IMAGE_TAG=$(date +%Y%m%d)-${COMMIT_HASH:0:7}; echo $IMAGE_TAG
docker build -t golang-demo-http-server-on-aws:${IMAGE_TAG} -t golang-demo-http-server-on-aws:latest .

docker images # コンテナイメージが増えたことを確認

# run # `docker run --rm -p 80:<port> IMAGE <addr> <port>`
docker ps -a # コンテナのプロセスが起動していないことを確認

docker run -d --rm -p 80:80 --name demo-container golang-demo-http-server-on-aws:${IMAGE_TAG} 80

docker ps -a # コンテナのプロセスが起動していることを確認

docker stop `docker ps -a | sed '1d' | awk '{print $1}'`
docker ps -a # コンテナのプロセスが起動していないことを確認

# ECR へ login #
ECR_REGISTRY=$(aws sts get-caller-identity --output text --query Account).dkr.ecr.ap-northeast-1.amazonaws.com
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin ${ECR_REGISTRY}

# push (after login)#
docker images
docker tag golang-demo-http-server-on-aws:${IMAGE_TAG} ${ECR_REGISTRY}/golang-demo-http-server-on-aws:${IMAGE_TAG}
docker images

docker push ${ECR_REGISTRY}/golang-demo-http-server-on-aws:${IMAGE_TAG}

# pull (after login)#
docker rmi `docker images | sed '1d' | awk '{print $1 ":" $2}' | grep -v "<none>"` # ローカルのコンテナイメージを全削除
docker rmi `docker images | sed '1d' | awk '{print $3}'` # ローカルのコンテナイメージを全削除
docker images # ローカルのコンテナイメージを表示 (何も表示されない)

docker pull ${ECR_REGISTRY}/golang-demo-http-server-on-aws:${IMAGE_TAG} # いきなり docker run しても OK
docker run -d --rm -p 80:80 --name demo-container ${ECR_REGISTRY}/golang-demo-http-server-on-aws:${IMAGE_TAG} 80
```
