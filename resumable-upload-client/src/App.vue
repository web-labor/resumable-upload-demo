<template>
  <div id="app">
    <div class="upload-btn">
      +
      <input type="file" @change="getFile">
    </div>
    <div class="file-info">
      <div class="info-line" v-if="file">
        <p class="file-name">{{file ? file.name : '' | ellipsis}}</p>
        <p>大小：{{file | calFileInfo}}</p>
      </div>
      <div class="progress">
        <p class="progress-font">
          {{progress}}%
        </p>
        <div class="progress-wrapper">
          <div class="progress-par" :style="'width:' + progress + '%'">
            <div class="progress-bar"></div>
          </div>
        </div>
        <p class="progress-reslut">{{chunkDoneTotal}} / {{chunkTotal}}</p>
      </div>
    </div>
    <!-- 底部按钮 -->
    <div class="bottom-button">
      <div
        :class="allowUpload ? 'start-upload' : 'start-upload start-upload-noallow'"
        @click="startUpload"
      >开始上传</div>
      <div class="chunk-size-radio">
        <div class="radio-item"
             v-for="(item, index) in chunkSizeList"
             :key="index">
          <input type="radio" name="chunkSize" :id="item.for" :value="item.value" v-model="chunkSize" @change="sizeSelect">
          <label :for="item.for" class="chunk-size-radio-item">{{item.label}}</label>
        </div>
      </div>
    </div>
    <!-- 操作提示信息 -->
    <div v-if="tips" :class="bottomTipsClassName">{{tips}}</div>
  </div>
</template>

<script>
import axios from 'axios'
import SparkMD5 from "spark-md5";

const KB = 1024
const MB = 1024 * KB
const GB = 1024 * MB

const baseUrl = "http://192.168.0.109:3000/";
axios.defaults.baseURL = baseUrl;


const CHUNK_SIZE_LIST = [
  { for: '2', label: '2 MB', value: '2097152'},
  { for: '5', label: '5 MB', value: '5242880'},
  { for: '10', label: '10 MB', value: '10485760'}
]

export default {
  name: 'App',
  data () {
    return {
      allowUpload: true,
      chunkDoneTotal: 0,
      chunkSize: 2097152,
      showChunkSize: false,
      showChunkSelect: false,
      file: null,
      chunkSizeList: CHUNK_SIZE_LIST,
      chunkTotal: 0,
      tips: '',
      bottomTipsClassName: 'bottom-tips-success',
      fileHash: ''
    }
  },
  methods: {
    // 选择分片大小
    sizeSelect(e) {
      this.chunkDoneTotal = 0
      this.chunkSize = e.target.value
      this.showChunkSize = true
      this.showChunkSelect = false
      this.getFile()
    },
    // 发送初始文件校验
    async postFileHash() {
      const that = this;
      return new Promise((resolve, reject) => {
        axios.post("/hash_check", {
            hash: that.fileHash,
            chunkSize: that.chunkSize,
            total: that.chunkTotal,
          })
          .then((res) => {
            if (res.data.success) {
              resolve(res.data.data);
            }
          })
          .catch((err) => {
            reject(err);
            that.updateTips("error", err);
          });
      });
    },
    // 发送合并分支请求
    async postChunkMerge(data) {
      const that = this;
      axios
        .post("/chunks_merge", data)
        .then((res) => {
          if (res.data.success) {
            that.chunkDoneTotal = that.chunkTotal;
            that.updateTips("success", "文件分片上传完结并合并成功");
          } else {
            that.updateTips("error", res.data.msg);
          }
        })
        .catch((err) => {
          that.updateTips("error", err);
        });
    },
    // 点击开始上传
    async startUpload() {
      const that = this;
      if (!this.allowUpload) {
        that.updateTips("warning", "正在读取文件计算哈希中，请耐心等待");
        return;
      }
      that.chunkDoneTotal = 0;
      // 1.获取文件
      if (!that.file) {
        that.updateTips("error", "获取文件失败，请重试");
        return;
      }
      // 2.跟后台校验当前文件是否已经上传过 or 是否需要切换断点续传 返回数据中 res.data == 2(文件已上传过) 1(断点续传) 0(从未上传)
      const res = await that.postFileHash();
      if (res && res.type == 2) {
        that.updateTips(
          "warning",
          "检查成功，文件在服务器上已存在，不需要重复上传"
        );
        return;
      } else {
        that.updateTips("warning", "分片正在加紧上传中，请勿关闭网页窗口");
        // 3.初始化对应请求队列并执行
        await that.buildFormDataToSend(
          that.chunkTotal,
          that.file,
          that.fileHash,
          res
        );
      }
    },
    // 构建HTTP FormData数据并请求，最后请求合并分片
    async buildFormDataToSend(chunkCount, file, hash, res) {
      const that = this;
      const chunkReqArr = [];
      for (let i = 0; i < chunkCount; i++) {
        if (
          res.type == 0 ||
          (res.type == 1 &&
            res.index &&
            res.index.length > 0 &&
            !res.index.includes(i.toString()))
        ) {
          // 构建需要上传的分片数据
          const start = i * this.chunkSize;
          const end = Math.min(file.size, start + this.chunkSize);
          const form = new FormData();
          form.append("file", file.slice(start, end));
          console.log(file.slice(start, end))
          form.append("name", file.name);
          form.append("total", chunkCount);
          form.append("chunkSize", this.chunkSize);
          form.append("index", i);
          form.append("size", file.size);
          form.append("hash", hash);
          const chunkReqItem = axios.post("/chunks_upload", form, {
            onUploadProgress: (e) => {
              // e为ProgressEvent，当loaded===total表明该分片上传完成
              if (e.loaded === e.total) {
                that.chunkDoneTotal += 1;
              }
            },
          });
          chunkReqArr.push(chunkReqItem);
        }
      }
      for (let item of chunkReqArr) {
        await item;
      }
      that.updateTips("success", "分片上传完成，正在请求合并分片");
      // 合并chunks
      const data = {
        chunkSize: that.chunkSize,
        name: file.name,
        total: that.chunkTotal,
        hash: that.fileHash,
      };
      that.postChunkMerge(data);
    },
    // 根据文件大小自动匹配合适的分片大小，并计算哈希
    async getFile(e) {
      this.file = e.target.files[0]
      if (!this.file) {
        this.updateTips("error", "获取文件失败，请重试");
        return;
      }
      await this.calFileHash(this.file);
    },
    // 计算文件哈希
    calFileHash(file) {
      return new Promise((resolve, reject) => {
        const chunks = Math.ceil(file.size / this.chunkSize);
        this.chunkTotal = chunks;

        const spark = new SparkMD5.ArrayBuffer();
        const fileReader = new FileReader();
        const that = this;
        let currentChunk = 0;
        that.updateTips("success", "正在读取文件计算哈希中，请耐心等待");

        fileReader.onload = function (e) {
          console.log("read chunk: ", currentChunk + 1, "of", chunks);
          spark.append(e.target.result); // Append array buffer
          currentChunk++;

          if (currentChunk < chunks) {
            loadNext();
          } else {
            that.chunkTotal = currentChunk;
            const hash = spark.end();
            that.fileHash = hash;
            that.allowUpload = true;

            that.updateTips("success", "加载文件成功，文件哈希为" + hash);
            resolve(hash);
          }
        };

        fileReader.onerror = function () {
          that.updateTips("error", "读取切分文件失败，请重试");
          reject("读取切分文件失败，请重试");
        };

        function loadNext() {
          var start = currentChunk * that.chunkSize,
            end =
              start + that.chunkSize >= file.size
                ? file.size
                : start + that.chunkSize;
          fileReader.readAsArrayBuffer(file.slice(start, end));
        }

        loadNext();
      }).catch((err) => {
        console.log(err);
      });
    },
    // 更新提示信息
    updateTips(type, msg) {
      this.bottomTipsClassName = `bottom-tips-${type}`;
      this.tips = msg;
    },
  },
  filters: {
    calFileInfo(file) {
      if (!file) {
        return ''
      }
      const fileSize = file.size
      let fileSizeF = 0
      let fileUnit = ''
      if (fileSize >= GB) {
        fileSizeF = parseFloat(fileSize / GB).toFixed(2);
        fileUnit = 'GB';
      } else if (fileSize >= MB) {
        fileSizeF = parseFloat(fileSize / MB).toFixed(2);
        fileUnit = 'MB';
      } else if (fileSize >= KB) {
        fileSizeF = parseFloat(fileSize / KB).toFixed(2);
        fileUnit = 'KB';
      }
      return `${fileSizeF}.${fileUnit}`
    },
    ellipsis(value) {
      if (value.length >= 15) {
        return `${value.substr(0, 3)}...${value.substr(value.length - 7)}`;
      } else {
        return value;
      }
    },
  },
  computed: {
    progress () {
      if (!this.chunkTotal) {
        return 0.00;
      } else {
        return parseFloat(
          (this.chunkDoneTotal / this.chunkTotal) * 100
        ).toFixed(2);
      }
    }
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  width: 560px;
  margin: 60px auto 0;
}
.upload-btn {
  position: relative;
  width: 100px;
  height: 100px;
  margin: 0 auto;
  font-size: 30px;
  text-align: center;
  line-height: 100px;
  border: 1px dashed #000;
  border-radius: 10px;
  cursor: pointer;
}
.upload-btn:hover {
  border-color: #5c8fc1;
  color: #5c8fc1;
}
.upload-btn input {
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  opacity: 0;
  cursor: pointer;
}
.start-upload {
  width: 300px;
  height: 40px;
  margin: 30px auto;
  line-height: 40px;
  color: #fff;
  background-color: rgb(81, 111, 250);
  border-radius: 5px;
  cursor: pointer;
}
.start-upload-noallow {
  cursor: no-drop;
}

.file-info {
  width: 500px;
  margin: 30px auto 0;
  padding: 0 30px;
  border-radius: 10px;
  background: #f6f6f6;
}

.info-line {
  display: flex;
  justify-content: space-between;
}

.file-name {
  flex: 1;
  text-align: left;
}

.chunk-size-radio {
  display: flex;
  justify-content: center;
}

.progress {
  display: flex;
  align-items: center;
  padding: 30px 0;
}

.progress-wrapper {
  flex: 1;
  height: 15px;
  border-radius: 8px;
  margin: 0 16px;
  background-color: #ccc;
}
.progress-par {
  overflow: hidden;
  height: 100%;
  border-radius: 8px;
}
.progress-bar {
  flex: 1;
  height: 100%;
  background: rgb(81, 111, 250);
  border-radius: 8px;
  background-image: repeating-linear-gradient(
    30deg,
    hsla(0, 0%, 100%, 0.1),
    hsla(0, 0%, 100%, 0.1) 15px,
    transparent 0,
    transparent 30px
  );
  -webkit-animation: progressbar 5s linear infinite;
  animation: progressbar 5s linear infinite;
}

.bottom-tips-success {
  height: 38px;
  line-height: 38px;
  margin-top: 30px;
  font-size: 14px;
  border-radius: 5px;
  color: #67c23a;
  background: #f0f9eb;
  border: 1px solid #c2e7b0;
}
.bottom-tips-error {
  height: 38px;
  line-height: 38px;
  margin-top: 30px;
  font-size: 14px;
  border-radius: 5px;
  color: #f56c6c;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
}
.bottom-tips-warning {
  height: 38px;
  line-height: 38px;
  margin-top: 30px;
  font-size: 14px;
  border-radius: 5px;
  color: #e6a23c;
  background: #fdf6ec;
  border: 1px solid #f5dab1;
}

@-webkit-keyframes progressbar {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 356px 0;
  }
}
@keyframes progressbar {
  0% {
    background-position: 0% 0;
  }
  100% {
    background-position: 356px 0;
  }
}
</style>
