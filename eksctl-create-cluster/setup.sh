# for Amazon Linux 2023
## gettext contains envsubst
sudo dnf install git tree vim bash-completion gettext

# TODO install tools / kubect, aws-cli, eksctl, helm ...

## kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl.sha256"
echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check

sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

## helm
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh

## aws-cli
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

## eksctl
# for ARM systems, set ARCH to: `arm64`, `armv6` or `armv7`
ARCH=amd64
PLATFORM=$(uname -s)_$ARCH

curl -sLO "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$PLATFORM.tar.gz"

### (Optional) Verify checksum
curl -sL "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_checksums.txt" | grep $PLATFORM | sha256sum --check

tar -xzf eksctl_$PLATFORM.tar.gz -C /tmp && rm eksctl_$PLATFORM.tar.gz

sudo mv /tmp/eksctl /usr/local/bin

## argocd cli
VERSION=$(curl -L -s https://raw.githubusercontent.com/argoproj/argo-cd/stable/VERSION)
curl -sSL -o argocd-linux-amd64 https://github.com/argoproj/argo-cd/releases/download/v$VERSION/argocd-linux-amd64
sudo install -m 555 argocd-linux-amd64 /usr/local/bin/argocd
rm argocd-linux-amd64


# prepare Karpenter (ref: https://karpenter.sh/docs/getting-started/getting-started-with-karpenter/)
## Change settings
export KARPENTER_VERSION="X.Y.Z" # TODO
export EKS_CLUSTER_NAME=xxxx # TODO your eks cluster name ex) "demo-eksctl-defaultvpc"
export TEMPOUT="$(mktemp)"

## Prepare resources used by Karpenter
curl -fsSL https://raw.githubusercontent.com/aws/karpenter-provider-aws/v"${KARPENTER_VERSION}"/website/content/en/preview/getting-started/getting-started-with-karpenter/cloudformation.yaml  > "${TEMPOUT}"
sed -i "s/QueueName: \!Sub \"/QueueName: \!Sub \"karpenter-interruption-/" "${TEMPOUT}"
## Create some AWS resources like IAM Roles, SQS queues
aws cloudformation deploy \
  --stack-name "Karpenter-setup-resource-for-${EKS_CLUSTER_NAME}" \
  --template-file "${TEMPOUT}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "ClusterName=${EKS_CLUSTER_NAME}"

aws iam create-service-linked-role --aws-service-name spot.amazonaws.com || true
### If the role has already been successfully created, you will see:
### An error occurred (InvalidInput) when calling the CreateServiceLinkedRole operation: Service role name AWSServiceRoleForEC2Spot has been taken in this account, please try a different suffix.

# Create EKS Cluster with Karpenter settings
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export PRIVATE_SUBNET_DEF_1="ap-northeast-1a: { id: subnet-xxxxxx }" # TODO your region az and subnet ids
export PRIVATE_SUBNET_DEF_2="ap-northeast-1c: { id: subnet-xxxxxx }" # TODO
export PRIVATE_SUBNET_DEF_3="ap-northeast-1d: { id: subnet-xxxxxx }" # TODO
export KARPENTER_NODE_ROLE=KarpenterNodeRole-${EKS_CLUSTER_NAME}

## eksctl create cluster
curl -fsSL https://raw.githubusercontent.com/sugikeitter/aws-demo/main/eksctl-create-cluster/existing-vpc-cluster/eksctl-cluster-with-karpenter-config-example.yaml | envsubst | eksctl create cluster -f -

# If you add Cluster admin
export ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/xxx" # TODO
aws eks create-access-entry --cluster-name ${EKS_CLUSTER_NAME} --principal-arn ${ROLE_ARN} --type STANDARD
aws eks associate-access-policy --cluster-name ${EKS_CLUSTER_NAME} \
  --principal-arn ${ROLE_ARN}  \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
  --access-scope type=cluster

# create kubeconfig
aws eks update-kubeconfig --name $EKS_CLUSTER_NAME

# TODO Create VPC/subnet and tag to subnet
### Private subnet tags ###
# kubernetes.io/role/internal-elb 1 # To use internal ELB by AWS LB Contorller
# karpenter.sh/discovery $EKS_CLUSTER_NAME # To use Karpentar

### Public subnet tags ###
# kubernetes.io/role/elb 1 # To use internet-facing ELB by AWS LB Contorller
# karpenter.sh/discovery $EKS_CLUSTER_NAME # To use Karpentar


# Client setup to use EKS Cluster
mkdir ~/.bashrc.d
## k8s
kubectl completion bash >> ~/.bashrc.d/kubectl_completion.bash

cat << EOT >> ~/.bashrc.d/kubectl_completion.bash

# alias and auto comp
alias vi=vim
alias k=kubectl
complete -F __start_kubectl k

# short alias to set/show context/namespace (only works for bash and bash-compatible shells, current context to be set before using kn to set namespace)
alias kx='f() { [ "\$1" ] && kubectl config use-context \$1 || kubectl config current-context ; } ; f'
alias kn='f() { [ "\$1" ] && kubectl config set-context --current --namespace \$1 || kubectl config view --minify | grep namespace | cut -d" " -f6 ; } ; f'
export dry='--dry-run=client -o yaml'
# Use bash-completion, if available
if [[ -f /usr/share/bash-completion/bash_completion ]]; then
   source /usr/share/bash-completion/bash_completion;
fi

export KUBE_EDITOR=/usr/bin/vim
EOT

source ~/.bashrc


### Add AWS Load Balancer Contoroller (https://kubernetes-sigs.github.io/aws-load-balancer-controller) ###
# TODO set version
AWS_LB_CONTROLLER_VERSION=X.Y.Z

curl -o iam-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v${AWS_LB_CONTROLLER_VERSION}/docs/install/iam_policy.json

# if I have created AWSLoadBalancerControllerIAMPolicy before, delete it and create new version
aws iam delete-policy --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy

aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam-policy.json

## FIXME use pod identity, if supported.
eksctl create iamserviceaccount \
  --cluster=$EKS_CLUSTER_NAME \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

# TODO set version
HELM_AWS_LB_CONTROLLER_VERSION=X.Y.Z

helm repo add eks https://aws.github.io/eks-charts
helm repo update
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --version v${HELM_AWS_LB_CONTROLLER_VERSION} \
  --set clusterName=$EKS_CLUSTER_NAME \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

# Set up Argo CD
### Set up argocd manualy first
mkdir argocd-kustomize-setup
curl https://raw.githubusercontent.com/sugikeitter/aws-demo/main/eksctl-create-cluster/argocd-application-file/argocd-install-kustomize/kustomization.yaml > argocd-kustomize-setup/kustomization.yaml
curl https://raw.githubusercontent.com/sugikeitter/aws-demo/main/eksctl-create-cluster/argocd-application-file/argocd-install-kustomize/svc-argocd-server-patch.yaml > argocd-kustomize-setup/svc-argocd-server-patch.yaml
# TODO Change argocd version
vi argocd-kustomize-setup/kustomization.yaml
kubectl -n argocd apply -k argocd-kustomize-setup/.

### Use LoadBalancer
# Argo CD managed by Argo CD
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: argocd
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'https://github.com/sugikeitter/aws-demo.git'
    path: eksctl-create-cluster/argocd-application-file/argocd-install-kustomize
    targetRevision: HEAD
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF

# After setup Argo CD, manage aws-load-balancer-controller by Argo CD
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: aws-load-balancer-controller
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'https://aws.github.io/eks-charts'
    targetRevision: ${LOAD_BALANCER_CONTROLER_HELM_CHART_VERSION} 
    chart: aws-load-balancer-controller
    helm:
      parameters:
      - name: "clusterName"
        value: ${EKS_CLUSTER_NAME}
      - name: "serviceAccount.create"
        value: "false"
      - name: "serviceAccount.name"
        value: aws-load-balancer-controller
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: kube-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF

# Setup Karpenter

## Change Karpenter settings
KARPENTER_QUEUE_NAME=karpenter-interruption-${EKS_CLUSTER_NAME} #
KARPENTER_NODE_AMI_FAMILY=Bottlerocket
KARPENTER_NODE_ROLE=KarpenterNodeRole-${EKS_CLUSTER_NAME}

#### Create ArgoCD resource####
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: karpenter
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'public.ecr.aws/karpenter'
    targetRevision: ${KARPENTER_VERSION} # TODO Change version
    chart: karpenter
    helm:
      parameters:
      - name: "settings.clusterName"
        value: ${EKS_CLUSTER_NAME}
      - name: "settings.interruptionQueue"
        value: ${KARPENTER_QUEUE_NAME}
      - name: "controller.resources.requests.cpu"
        value: "1"
      - name: "controller.resources.requests.memory"
        value: 1Gi
      - name: "controller.resources.limits.cpu"
        value: "1"
      - name: "controller.resources.limits.memory"
        value: 1Gi
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: kube-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF

# # Or using Helm manually
# ## Logout of helm registry to perform an unauthenticated pull against the public ECR
# helm registry logout public.ecr.aws
# helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter --version "${KARPENTER_VERSION}" --namespace "kube-system" --create-namespace \
#   --set "settings.clusterName=${EKS_CLUSTER_NAME}" \
#   --set "settings.interruptionQueue=${KARPENTER_QUEUE_NAME}" \
#   --set controller.resources.requests.cpu=1 \
#   --set controller.resources.requests.memory=1Gi \
#   --set controller.resources.limits.cpu=1 \
#   --set controller.resources.limits.memory=1Gi \
#   --wait

## Create NodePool and EC2NodeClass
# TODO manage by Argo CD
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: karpenter-config
  namespace: argocd
spec:
  destination:
    server: https://kubernetes.default.svc
  project: default
  source:
    path: eksctl-create-cluster/argocd-application-file
    repoURL: https://github.com/sugikeitter/aws-demo
    targetRevision: HEAD
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF

# Setup metric server by argocd
cat <<EOF | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: metrics-server
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'https://kubernetes-sigs.github.io/metrics-server/'
    targetRevision: 3.12.1
    chart: metrics-server
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: kube-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF

# Setup CloudWatch Container Insights EKS add-on
## fluent-bit pod use Node IAM role
## Attach policy karpentar node role which is used by managed node groups
aws iam attach-role-policy \
--role-name ${KARPENTER_NODE_ROLE} \
--policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

kubectl create ns amazon-cloudwatch

eksctl create podidentityassociation \
    --cluster ${EKS_CLUSTER_NAME} \
    --namespace amazon-cloudwatch \
    --service-account-name cloudwatch-agent \
    --permission-policy-arns="arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy" \
    --role-name EKSContainerInsightsSARole 
#    --permission-policy-arns="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/CloudWatchAgentServerPolicy, arn:aws:iam::${AWS_ACCOUNT_ID}:policy/xxxx" \
#    --well-known-policies="autoScaler,externalDNS" \

aws eks create-addon --cluster-name ${EKS_CLUSTER_NAME} --addon-name amazon-cloudwatch-observability
