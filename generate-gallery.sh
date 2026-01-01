#!/bin/bash

# Script to generate gallery-images.js from images directory

echo "// Auto-generated file - do not edit manually" > gallery-images.js
echo "// Run generate-gallery.sh to update" >> gallery-images.js
echo "" >> gallery-images.js
echo "const galleryImages = [" >> gallery-images.js

# Find all image files in images directory and add them to the array
first=true
for file in images/*.{jpg,jpeg,png,gif,webp,JPG,JPEG,PNG,GIF,WEBP}; do
    # Check if file exists (glob might not match anything)
    if [ -f "$file" ]; then
        # Add comma before all entries except the first
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> gallery-images.js
        fi
        # Extract just the filename for alt text (without extension)
        filename=$(basename "$file")
        name="${filename%.*}"
        # Add the image path to array
        echo -n "    { src: '$file', alt: '$name' }" >> gallery-images.js
    fi
done

echo "" >> gallery-images.js
echo "];" >> gallery-images.js

echo "Generated gallery-images.js with $(grep -c "src:" gallery-images.js) images"
