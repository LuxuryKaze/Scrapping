import axios from "axios";
import * as cheerio from "cheerio";
import { writeFile } from "fs/promises";

// Konfigurasi headers untuk meniru browser
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.ebay.com/'
};

// Fungsi untuk mendapatkan HTML dengan retry mechanism
async function fetchWithRetry(url, retries = 3) {
  try {
    const response = await axios.get(url, { headers, timeout: 10000 });
    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying ${url}... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchWithRetry(url, retries - 1);
    }
    throw error;
  }
}

async function scrapeEbay() {
  const baseUrl = 'https://www.ebay.com/sch/i.html?_nkw=nike';
  let currentPage = 1;
  const maxPages = 3;
  const allProducts = [];

  try {
    while (currentPage <= maxPages) {
      const url = `${baseUrl}&_pgn=${currentPage}`;
      console.log(`Scraping page ${currentPage}: ${url}`);

      const html = await fetchWithRetry(url);
      const $ = cheerio.load(html);

      const products = [];

      $('.s-item').each((i, element) => {
        // Skip item pertama jika bukan produk
        if (i === 0 && !$(element).find('.s-item__title').text().trim()) return;

        const title = $(element).find('.s-item__title').text().trim() || '-';
        const subtitle = $(element).find('.s-item__subtitle').text().trim() || '-';
        const price = $(element).find('.s-item__price').text().trim() || '-';
        const productUrl = $(element).find('.s-item__link').attr('href') || '-';

        products.push({
          id: `ebay-${currentPage}-${i}`,
          title,
          subtitle,
          price,
          url: productUrl,
          description: '-' // Akan diisi nanti
        });
      });

      // Scrape deskripsi untuk setiap produk (dengan rate limiting)
      for (const product of products) {
        if (product.url && product.url !== '-') {
          try {
            const productHtml = await fetchWithRetry(product.url);
            const $product = cheerio.load(productHtml);

            const description = $product('#desc_ifr').contents().find('body').text().trim() ||
                              $product('.item-description').text().trim() ||
                              $product('.product-description').text().trim() ||
                              '-';

            product.description = description;
          } catch (error) {
            console.log(`Gagal mengambil deskripsi untuk ${product.title}: ${error.message}`);
            product.description = '-';
          }

          // Delay antara request
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      allProducts.push(...products);
      currentPage++;

      // Cek jika sudah di halaman terakhir
      if ($('.pagination__next.pagination__next--disabled').length > 0) {
        break;
      }

      // Delay sebelum halaman berikutnya
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Simpan hasil ke file JSON
    await writeFile('ebay_products_axios.json', JSON.stringify(allProducts, null, 2));
    console.log(`Data berhasil disimpan. Total produk: ${allProducts.length}`);

  } catch (error) {
    console.error('Error utama:', error.message);
  }
}

// Jalankan scraper
scrapeEbay();
