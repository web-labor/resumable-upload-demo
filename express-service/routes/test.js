var express = require('express');
var router = express.Router();
const fs = require('fs')
const TestModel = require('../modules/test');
let uploads = {}

/* GET users listing. */
router.get('/test', function (req, res, next) {
  // => 查询数据
  TestModel.find((err, r) => {
    if (err) {
      console.log(err);
      return;
    }
    res.send(r);
  });
});

router.post('/upload', (req, res, next) => {
  let fileId = decodeURI(req.headers['x-file-id'])
  let startByte = req.headers['x-start-byte']
  let name = decodeURI(req.headers['name'])
  let fileSize = parseInt(req.headers['size'], 10)

  console.log('upload requested', 'fileid', fileId, 'startByte', startByte, 'name', name, 'fileSize', fileSize)

  if (uploads[fileId] && fileSize === uploads[fileId].bytesReceived) {
    console.log('status: complete')
    res.send({ 'status': 'complete' })
    return
  }

  if (!fileId) {
    console.log('no such file')
    res.send({ 'status': 'No such file' })
    return
  }

  if (!uploads[fileId]) {
    uploads[fileId] = {}
  }

  let upload = uploads[fileId]

  let fileStream;
  if (startByte == '0') {
    console.log('new upload')
    upload.bytesReceived = 0;
    fileStream = fs.createWriteStream(`files/${name}`, { flags: 'w' })
  } else {
    console.log('resuming upload')
    if (upload.bytesRecieved != startByte) {
      res.send({ 'status': 'Wrong start byte' })
      return
    }
    fileStream = fs.createWriteStream(`files/${name}`, { flags: 'a' })
  }

  req.pipe(fileStream)

  req.on('data', data => {
    console.log('data')
    upload.bytesReceived += data.length
  })

  fileStream.on('close', () => {
    console.log(upload.bytesReceived, fileSize)
    if (upload.bytesReceived === fileSize) {
      console.log('upload finished')
      delete uploads[fileId]
      res.send({ 'status': 'uploaded' })
      return;
    } else {
      console.log('File unfinished, stopped at ' + upload.bytesReceived)
      res.send({ 'status': 'server error' })
      return;
    }
  })

  fileStream.on('error', err => {
    console.log('filestream error', err)
    res.send({ 'status': 'filestream error' })
    return;
  })
})

router.get('/status', (req, res) => {
  let fileId = decodeURI(req.headers['x-file-id'])
  let name = decodeURI(req.headers['name'])
  let fileSize = parseInt(req.headers['size'], 10)
  if (name) {
    try {
      if (fs.existsSync('files/' + name)) {
        let stats = fs.statSync('files')
        console.log(`Incoming file size is ${fileSize} and ${Math.floor(stats.size / fileSize * 100)}% is already uploaded`)
        if (fileSize === stats.size) {
          console.log('file present')
          res.send({ 'fileState': 'present' })
          return
        }
        uploads[fileId]['bytesReceived'] = stats.size
        console.log('bytes receive', stats.size)

      } else {
        console.log('file not present')
        uploads[fileId] = {}
        uploads[fileId]['bytesReceived'] = 0
      }

    } catch (e) {
      console.log('error', e)
    }

    let upload = uploads[fileId]
    console.log(upload, !upload)
    if (upload) {
      res.send({ "uploaded": upload })
    } else {
      res.send({ "uploaded": 0 })
    }
  } else {
    res.send('no name')
  }

})

module.exports = router;


// => 存储数据
// let test = new TestModel({
// 	userName: "木子李",
// });
// test.save((err, res) => {
// 	if(err) {
// 		console.log(err);
// 		return;
//   }
// 	console.log('res', res);
// })