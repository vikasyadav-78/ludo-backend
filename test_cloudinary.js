const { v2: cloudinary } = require('cloudinary');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the backend .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// Configure Cloudinary using credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function run() {
  try {
    console.log(`Using Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
    console.log('1. Uploading image to Cloudinary...');
    
    const uploadResult = await cloudinary.uploader.upload(
      'https://res.cloudinary.com/demo/image/upload/getting-started/shoes.jpg',
      {
        public_id: 'shoes_test',
        folder: 'battle_results_test'
      }
    );

    console.log('Secure URL:', uploadResult.secure_url);
    console.log('Public ID:', uploadResult.public_id);

    console.log('\n2. Retrieving image metadata details...');
    console.log(`Width: ${uploadResult.width}px`);
    console.log(`Height: ${uploadResult.height}px`);
    console.log(`Format: ${uploadResult.format}`);
    console.log(`File Size: ${uploadResult.bytes} bytes`);

    console.log('\n3. Generating optimized/transformed URL...');
    const optimizedUrl = cloudinary.url(uploadResult.public_id, {
      fetch_format: 'auto',
      quality: 'auto',
      secure: true
    });

    console.log('\nDone! Click link below to see optimized version of the image. Check the size and the format.');
    console.log(optimizedUrl);

  } catch (error) {
    console.error('Error during Cloudinary test execution:', error);
  }
}

run();
