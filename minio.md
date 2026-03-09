当然有！MinIO官方提供了非常完善的JavaScript/TypeScript SDK，在TypeScript项目中调用API非常方便。下面我详细介绍如何使用。

## 官方推荐：MinIO JavaScript SDK

### 1. 安装SDK

使用npm安装官方SDK：
```bash
npm install --save minio
```

**重要提示**：如果你使用的是 `minio` 版本 **7.1.0及以上**，SDK已经**内置了TypeScript类型定义**，无需额外安装 `@types/minio`。

### 2. 初始化客户端

创建MinIO客户端实例，连接到你之前用Docker启动的MinIO服务：

```typescript
import * as Minio from 'minio';

// 创建MinIO客户端
const minioClient = new Minio.Client({
  endPoint: '127.0.0.1',  // 你的MinIO服务器地址
  port: 9000,              // API端口
  useSSL: false,           // 如果未配置HTTPS，设为false
  accessKey: 'YOURUSERNAME', // 你之前设置的用户名
  secretKey: 'YOURPASSWORD'  // 你之前设置的密码
});
```

### 3. 基础操作示例

#### 检查存储桶是否存在并创建
```typescript
const bucketName = 'my-test-bucket';

async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (exists) {
      console.log(`Bucket '${bucketName}' 已存在`);
    } else {
      await minioClient.makeBucket(bucketName, 'us-east-1');
      console.log(`Bucket '${bucketName}' 创建成功`);
    }
  } catch (err) {
    console.error('操作失败:', err);
  }
}
```

#### 上传文件（从本地文件）
```typescript
import * as path from 'path';

async function uploadFile() {
  try {
    const sourceFile = '/path/to/your/file.txt'; // 本地文件路径
    const objectName = 'file.txt'; // 存储在MinIO中的文件名
    
    // 设置元数据（可选）
    const metaData = {
      'Content-Type': 'text/plain',
      'X-Amz-Meta-UploadedBy': 'typescript-sdk',
      'upload-timestamp': Date.now().toString()
    };
    
    // 使用fPutObject上传文件
    await minioClient.fPutObject(bucketName, objectName, sourceFile, metaData);
    console.log(`文件 ${sourceFile} 上传成功，存储为 ${objectName}`);
  } catch (err) {
    console.error('上传失败:', err);
  }
}
```

#### 上传数据（直接写入内容）
```typescript
async function uploadText() {
  try {
    const objectName = 'hello.txt';
    const content = 'Hello MinIO from TypeScript!';
    
    // 直接上传文本内容
    await minioClient.putObject(bucketName, objectName, content);
    console.log('文本内容上传成功');
  } catch (err) {
    console.error('上传失败:', err);
  }
}
```

#### 下载文件
```typescript
import * as fs from 'fs';

async function downloadFile() {
  try {
    const objectName = 'file.txt';
    const downloadPath = '/path/to/download/file.txt';
    
    // 获取文件流
    const dataStream = await minioClient.getObject(bucketName, objectName);
    
    // 将流写入文件
    const writeStream = fs.createWriteStream(downloadPath);
    dataStream.pipe(writeStream);
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    console.log(`文件下载成功，保存至 ${downloadPath}`);
  } catch (err) {
    console.error('下载失败:', err);
  }
}
```

#### 列出存储桶中的对象
```typescript
async function listObjects() {
  try {
    const objectsStream = minioClient.listObjects(bucketName, '', true);
    
    objectsStream.on('data', (obj) => {
      console.log('对象信息:', {
        名称: obj.name,
        大小: obj.size,
        最后修改: obj.lastModified,
        etag: obj.etag
      });
    });
    
    objectsStream.on('error', (err) => {
      console.error('列出对象时出错:', err);
    });
    
    objectsStream.on('end', () => {
      console.log('对象列表获取完成');
    });
  } catch (err) {
    console.error('操作失败:', err);
  }
}
```

#### 生成预签名URL（临时访问链接）
```typescript
async function generatePresignedUrl() {
  try {
    const objectName = 'file.txt';
    const expiry = 24 * 60 * 60; // 24小时有效期（秒）
    
    // 生成用于下载的预签名URL
    const presignedUrl = await minioClient.presignedGetObject(
      bucketName, 
      objectName, 
      expiry
    );
    
    console.log('临时下载链接:', presignedUrl);
    console.log('该链接24小时内有效');
    
    // 也可以生成上传用的预签名URL
    const uploadUrl = await minioClient.presignedPutObject(
      bucketName,
      'upload-file.txt',
      expiry
    );
    console.log('上传链接:', uploadUrl);
  } catch (err) {
    console.error('生成链接失败:', err);
  }
}
```

#### 删除对象
```typescript
async function deleteObject() {
  try {
    const objectName = 'file.txt';
    await minioClient.removeObject(bucketName, objectName);
    console.log(`对象 ${objectName} 删除成功`);
  } catch (err) {
    console.error('删除失败:', err);
  }
}
```

### 4. 完整的TypeScript示例

下面是一个完整的可运行示例，整合了上述操作：

```typescript
import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';

// 配置接口（可选，用于类型安全）
interface MinioConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
}

class MinioService {
  private client: Minio.Client;
  private bucketName: string;

  constructor(config: MinioConfig, bucketName: string) {
    this.client = new Minio.Client(config);
    this.bucketName = bucketName;
  }

  // 初始化存储桶
  async initialize(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName, 'us-east-1');
        console.log(`存储桶 ${this.bucketName} 创建成功`);
      } else {
        console.log(`存储桶 ${this.bucketName} 已存在`);
      }
    } catch (err) {
      console.error('初始化失败:', err);
      throw err;
    }
  }

  // 上传文件
  async uploadFile(localPath: string, objectName?: string): Promise<string> {
    const finalObjectName = objectName || path.basename(localPath);
    
    try {
      const metaData = {
        'Content-Type': 'application/octet-stream',
        'Upload-Date': new Date().toISOString()
      };
      
      await this.client.fPutObject(
        this.bucketName, 
        finalObjectName, 
        localPath, 
        metaData
      );
      
      console.log(`文件上传成功: ${finalObjectName}`);
      return finalObjectName;
    } catch (err) {
      console.error('上传失败:', err);
      throw err;
    }
  }

  // 获取文件信息
  async getFileInfo(objectName: string): Promise<Minio.BucketItemStat> {
    try {
      const stat = await this.client.statObject(this.bucketName, objectName);
      console.log('文件信息:', stat);
      return stat;
    } catch (err) {
      console.error('获取文件信息失败:', err);
      throw err;
    }
  }

  // 获取下载链接
  async getDownloadUrl(objectName: string, expirySeconds: number = 3600): Promise<string> {
    try {
      const url = await this.client.presignedGetObject(
        this.bucketName, 
        objectName, 
        expirySeconds
      );
      return url;
    } catch (err) {
      console.error('生成下载链接失败:', err);
      throw err;
    }
  }
}

// 使用示例
async function main() {
  const config: MinioConfig = {
    endPoint: '127.0.0.1',
    port: 9000,
    useSSL: false,
    accessKey: 'YOURUSERNAME',  // 替换为你的用户名
    secretKey: 'YOURPASSWORD'   // 替换为你的密码
  };

  const minioService = new MinioService(config, 'my-ts-bucket');

  try {
    // 1. 初始化存储桶
    await minioService.initialize();

    // 2. 上传文件
    await minioService.uploadFile('/tmp/test.txt', 'test-upload.txt');

    // 3. 获取文件信息
    const info = await minioService.getFileInfo('test-upload.txt');
    console.log('文件大小:', info.size, '字节');

    // 4. 生成临时下载链接
    const url = await minioService.getDownloadUrl('test-upload.txt', 3600);
    console.log('临时下载链接:', url);

  } catch (err) {
    console.error('程序执行出错:', err);
  }
}

// 运行
main();
```

## SDK主要功能概览

MinIO JavaScript SDK提供了丰富的API，涵盖以下功能：

| 功能分类 | 主要API | 说明 |
|---------|---------|------|
| **存储桶操作** | `makeBucket()`, `listBuckets()`, `bucketExists()`, `removeBucket()` | 创建、列出、检查、删除存储桶 |
| **存储桶策略** | `setBucketPolicy()`, `getBucketPolicy()` | 配置存储桶访问权限 |
| **对象操作** | `putObject()`, `getObject()`, `statObject()`, `removeObject()` | 上传、下载、获取信息、删除对象 |
| **文件操作** | `fPutObject()`, `fGetObject()` | 直接操作本地文件系统 |
| **大文件上传** | 自动分片上传 | 处理大文件自动使用分片上传 |
| **预签名URL** | `presignedGetObject()`, `presignedPutObject()`, `presignedPostPolicy()` | 生成临时访问链接 |
| **监听事件** | `listenBucketNotification()` | 监控存储桶事件 |

## 注意事项

1. **版本兼容性**：TypeScript用户请确保使用`minio` 7.1.0以上版本，内置类型定义，无需额外安装`@types/minio`

2. **环境变量**：建议将敏感信息（accessKey/secretKey）通过环境变量传入，而非硬编码在代码中

3. **错误处理**：SDK方法可能抛出`S3Error`等异常，建议做好错误处理

4. **连接配置**：根据你的MinIO部署情况调整`endPoint`、`port`和`useSSL`参数

5. **异步API**：SDK同时支持Promise和回调两种风格，推荐使用Promise/async-await方式

这个SDK是目前在TypeScript/JavaScript项目中与MinIO交互的最佳选择，功能全面且维护良好。如果有更具体的需求（如分片上传、生命周期管理等），可以查阅官方API文档获取更详细的示例。