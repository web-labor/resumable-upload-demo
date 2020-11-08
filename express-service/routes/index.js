const express = require('express');
const path = require('path');
const fs = require('fs');
const { streamMerge } = require('split-chunk-merge');
const uploadPath = path.join(__dirname, '../uploads');
const formidable = require('formidable');
const router = express.Router();

const mkdirsSync = (dirname) => {
  if (fs.existsSync(dirname)) {
      return true;
  } else {
      if (mkdirsSync(path.dirname(dirname))) {
          fs.mkdirSync(dirname);
          return true;
      }
  }
}

/**
   *
   * @param {*} url
   */
  function deleteFolderRecursive(url) {
    var files = [];
    /**
     * 判断给定的路径是否存在
     */
    if (fs.existsSync(url)) {
        /**
         * 返回文件和子目录的数组
         */
        files = fs.readdirSync(url);
        files.forEach(function (file, index) {

            var curPath = path.join(url, file);
            /**
             * fs.statSync同步读取文件夹文件，如果是文件夹，在重复触发函数
             */
            if (fs.statSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);

            } else {
                fs.unlinkSync(curPath);
            }
        });
        /**
         * 清除文件夹
         */
        fs.rmdirSync(url);
    } else {
        console.log("给定的路径不存在，请给出正确的路径");
    }
}
/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/hash_check', (req, res, next) => {
  const {
    total,
    chunkSize,
    hash
  } = req.body
  const chunksPath = path.join(uploadPath, hash + '-' + chunkSize, '/');
  if (fs.existsSync(chunksPath)) {
    // 目录存在，判断是否已上传完还是需要断点续传
    const chunks = fs.readdirSync(chunksPath);
    if (chunks.length !== 0 && chunks.length == total) {
      res.send({
        success: true,
        msg: '检查成功，文件在服务器上已存在，不需要重复上传',
        data: {
          type: 2, // type=2 为文件已上传过
        }
      })
    } else {
      const index = []
      chunks.forEach(item => {
        const chunksNameArr = item.split('-')
        index.push(chunksNameArr[chunksNameArr.length - 1])
      })
      res.send({
        success: true,
        msg: '检查成功，需要断点续传',
        data: {
          type: 1, // type=2 为文件已上传过
          index
        }
      })
    }
  } else {
    mkdirsSync(chunksPath);
    res.send({
      success: true,
      msg: '检查成功',
      data: {
        type: 0, // type=0 为从未上传
      }
    })
  }
})

// 分片上传
router.post('/chunks_upload', (req, res, next) => {
  // 获取form-data
  const form = new formidable.IncomingForm()
  form.uploadDir = uploadPath
  form.parse(req, (err, fields, files) => {
    if (err) {
      res.send({
        success: false,
        msg: '保存文件失败',
        data: ''
      })
      return
    }
    const {
      file,
      name,
      total,
      index,
      size,
      chunkSize,
      hash
    } = fields
    const chunksPath = path.join(uploadPath, hash + '-' + chunkSize, '/');
    const oldpath = files.file.path
    const newpath = chunksPath + hash + '-' + index
    fs.rename(oldpath, newpath, (err) => {
      if (err) {
        res.send({
          success: false,
          msg: '重命名失败',
          data: ''
        })
        return
      }
      console.log(`log: 断点临时文件${hash}-${index}保存成功`)
      res.send({
        success: true,
        msg: '上传成功',
        data: ''
      })
    })
  })
  form.on('error', function (err) {
    res.send({
      success: false,
      msg: '上传失败',
      data: ''
    })
  });
})

router.post('/chunks_merge', async (req, res, next) => {
  const {
    chunkSize,
    name,
    total,
    hash
  } = req.body;
  // 根据hash值，获取分片文件。
  const chunksPath = path.join(uploadPath, hash + '-' + chunkSize, '/');
  const filePath = path.join(uploadPath, name);
  // 读取所有的chunks 文件名存放在数组中
  const chunks = fs.readdirSync(chunksPath);
  const chunksPathList = []
  if (chunks.length !== total || chunks.length === 0) {
    ctx.body = {
      success: false,
      msg: '切片文件数量与请求不符合，无法合并',
      data: ''
    };
  }
  chunks.forEach(item => {
    chunksPathList.push(path.join(chunksPath, item))
  })

  // const writeStream = fs.createWriteStream(filePath);
  try {
    await streamMerge(chunksPathList, filePath, chunkSize)
    // 删除临时文件夹
    deleteFolderRecursive(chunksPath)
    res.send({
      success: true,
      msg: '合并成功',
      data: ''
    })
  } catch {
    res.send({
      success: false,
      msg: '合并失败，请重试',
      data: ''
    })
  }
})


module.exports = router;
