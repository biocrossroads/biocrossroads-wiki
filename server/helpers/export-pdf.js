const pup = require('puppeteer');
const axios = require('axios');
const findRemoveSync = require('find-remove');
const PDFMerger = require('pdf-merger-js');
const crypto = require('crypto');
const path = require('path')
const fs = require('fs');
const PDF_PATH_PREFIX = './server/pdf';
const PDF_FILE_PREFIX = 'bd_tmp_';
const PDF_DEST_FILE_PATH_PREFIX = 'BookOfData_';

const merge = new PDFMerger();

module.exports = {
  cleanupFilesSync(path_prefix, age) {
    if (path_prefix === 'null' || path_prefix === '') return;
    try {
      findRemoveSync(PDF_PATH_PREFIX, {
        prefix: path_prefix,
        age: age,
        limit: 100
      });
    } catch (error) { }
  },
  getPages() {
    const url = 'http://localhost:3000/graphql';
    const headers = {
      'content-type': 'application/json'
    };
    const qry = {
      'query': 'query{pages{list{path,tags}}}'
    }
    return axios({
      url: url,
      method: 'post',
      headers: headers,
      data: qry
    }).then(function (response) {
      return response.data.data.pages.list
        .filter(e => !e.tags.includes('no-pdf'))
        .map(e => e.path)
        .sort((a, b) => {
          if (a > b) return 1
          else if (b > a) return -1
          else return 0;
        });
    });
  },

  async createPdfFile(urls, uid) {
    const batch_size = process.env.PDF_EXPORT_BATCH_SIZE || 5;

    let i = 0; let iter = 0;
    const brower = await pup.launch({
      timeout: 0,
      args: ['--disable-dev-shm-usage']
    });

    while (i < urls.length) {
      await Promise.all(urls.slice(i, i + batch_size).map(async (url, i) => {
        const page = await brower.newPage();
        await page.goto(`http://localhost:3000/${url}`, {
          waitUntil: 'networkidle2'
        });

        await page.pdf({
          path: path.join(PDF_PATH_PREFIX, `${PDF_FILE_PREFIX}${uid}_${i + (batch_size * iter)}.pdf`),
          margin: { top: 1, bottom: 1, left: 1, right: 1 },
          printBackground: true
        });

        await page.close();
      }));
      iter = iter + 1
      i = i + batch_size;
    }

    await brower.close();
  },

  async createPdfFileSingleton(urls, uid) {
    let i = 0;
    const brower = await pup.launch({
      timeout: 120000,
      args: ['--disable-dev-shm-usage']
    });
    const page = await brower.newPage();

    while (i < urls.length) {
      try {
        const url = urls[i]
        await page.goto(`http://localhost:3000/${url}`, {
          waitUntil: 'networkidle2'
        });
        await page.pdf({
          path: path.join(PDF_PATH_PREFIX, `${PDF_FILE_PREFIX}${uid}_${i}.pdf`),
          margin: { top: 1, bottom: 1, left: 1, right: 1 },
          printBackground: true
        });

      } catch (err) {
        throw new Error(err)
      }
      i = i + 1
    }
    await brower.close();
  },

  async generatePdfs(pages, uid) {
    // await this.createPdfFile(pages, uid);
    await this.createPdfFileSingleton(pages, uid);
    return pages.map((p, i) => {
      return path.join(PDF_PATH_PREFIX, `${PDF_FILE_PREFIX}${uid}_${i}.pdf`);
    });

  },

  mergePdfs(files, dest_file_path, cb) {
    for (let f of files) {
      merge.add(f);
    }
    merge.save(dest_file_path).then(() => {
      cb(dest_file_path);
    });
  },

  useExisting() {
    files = fs.readdirSync(PDF_PATH_PREFIX);
    f = files.filter(f => f.includes(PDF_DEST_FILE_PATH_PREFIX)).map(f => {
      return {
        name: f,
        time: fs.statSync(path.join(PDF_PATH_PREFIX, f)).ctime.getTime()
      };
    }).filter(f => {
      // return false; // generate pdf always
      // return (new Date().getTime() - new Date(f.time).getTime()) / 600000 < 1 // created less than 10 mins
      return (new Date().getTime() - new Date(f.time).getTime()) / 60000 < 21600 // created in last 15 days.
    }).sort((a, b) => {
      return b.time - a.time
    }).map(f => f.name);

    if (f !== 'null' && f !== 'undefined' || f[0] !== 'null' || f[0] !== 'undefined') {
      return f[0]
    } else {
      return []
    }
  },

  exportPdf(refresh, cb) {
    try {
      existingFile = this.useExisting();
      if (refresh === false && (existingFile !== undefined && existingFile !== '')) {
        return cb(path.join(PDF_PATH_PREFIX, existingFile));
      } else {

        // clean up any old tmp files.
        this.cleanupFilesSync(PDF_FILE_PREFIX, 1);
        this.cleanupFilesSync(PDF_DEST_FILE_PATH_PREFIX, 1);

        // get pages and generate pdf files.
        const uid = crypto.randomUUID();
        const exported_file_name = path.join(PDF_PATH_PREFIX, `${PDF_DEST_FILE_PATH_PREFIX}${uid}.pdf`);
        this.getPages()
          .then(pages => {
            // pages.unshift('home');
            return this.generatePdfs(pages, uid);
          })
          .then(files => {
            this.mergePdfs(files, exported_file_name, fn => {
              try {
                this.cleanupFilesSync(PDF_FILE_PREFIX, 1);
              } catch (err) { }
              cb(fn);
            })
          })
          .catch((err) => {
            throw err;
          });
      }

    } catch (err) {
      if (err === 'null' || err === 'undefined') {
        throw new Error('exporting the pages to pdf failed');
      }
      throw err;
    }
  }
}