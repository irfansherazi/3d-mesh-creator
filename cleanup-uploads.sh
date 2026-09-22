#!/bin/bash

# Advanced Upload Directory Cleanup Script
# Keeps the system running smoothly by managing file storage

UPLOADS_DIR="${UPLOADS_DIR:-/home/ubuntu/3d-mesh-creator/uploads}"
LOG_FILE="${LOG_FILE:-/home/ubuntu/logs/cleanup.log}"
MAX_FILES=50
MAX_AGE_DAYS=7
MAX_SIZE_MB=2048  # 2GB

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S'): $1" | tee -a "$LOG_FILE"
}

# Function to get directory size in MB
get_dir_size_mb() {
    du -sm "$UPLOADS_DIR" 2>/dev/null | cut -f1 || echo "0"
}

# Function to count files in directory
count_files() {
    find "$UPLOADS_DIR" -type f \( -name "*.ply" -o -name "*.pcd" -o -name "*.obj" -o -name "*.glb" \) 2>/dev/null | wc -l
}

log_message "=== CLEANUP START ==="

# Check if uploads directory exists
if [ ! -d "$UPLOADS_DIR" ]; then
    log_message "Uploads directory does not exist: $UPLOADS_DIR"
    exit 1
fi

INITIAL_SIZE=$(get_dir_size_mb)
INITIAL_COUNT=$(count_files)

log_message "Initial state: ${INITIAL_COUNT} files, ${INITIAL_SIZE}MB"

# Cleanup Strategy 1: Remove files older than MAX_AGE_DAYS
log_message "Removing files older than $MAX_AGE_DAYS days..."
OLD_FILES_REMOVED=$(find "$UPLOADS_DIR" -type f \( -name "*.ply" -o -name "*.pcd" -o -name "*.obj" -o -name "*.glb" \) -mtime +$MAX_AGE_DAYS -print -delete 2>/dev/null | wc -l)

if [ "$OLD_FILES_REMOVED" -gt 0 ]; then
    log_message "Removed $OLD_FILES_REMOVED old files"
fi

# Cleanup Strategy 2: Keep only the latest MAX_FILES files
CURRENT_COUNT=$(count_files)
if [ "$CURRENT_COUNT" -gt "$MAX_FILES" ]; then
    log_message "Too many files ($CURRENT_COUNT > $MAX_FILES), keeping only latest $MAX_FILES"

    # Remove excess files (keep newest MAX_FILES)
    find "$UPLOADS_DIR" -type f \( -name "*.ply" -o -name "*.pcd" -o -name "*.obj" -o -name "*.glb" \) -printf '%T@ %p\n' | \
    sort -n | \
    head -n -$MAX_FILES | \
    cut -d' ' -f2- | \
    while IFS= read -r file; do
        rm -f "$file"
        log_message "Removed excess file: $(basename "$file")"
    done
fi

# Cleanup Strategy 3: Size-based cleanup if directory is too large
CURRENT_SIZE=$(get_dir_size_mb)
if [ "$CURRENT_SIZE" -gt "$MAX_SIZE_MB" ]; then
    log_message "Directory too large (${CURRENT_SIZE}MB > ${MAX_SIZE_MB}MB), removing oldest files"

    # Remove files until we're under the size limit
    while [ "$(get_dir_size_mb)" -gt "$MAX_SIZE_MB" ]; do
        OLDEST_FILE=$(find "$UPLOADS_DIR" -type f \( -name "*.ply" -o -name "*.pcd" -o -name "*.obj" -o -name "*.glb" \) -printf '%T@ %p\n' | sort -n | head -1 | cut -d' ' -f2-)

        if [ -n "$OLDEST_FILE" ] && [ -f "$OLDEST_FILE" ]; then
            rm -f "$OLDEST_FILE"
            log_message "Removed for size limit: $(basename "$OLDEST_FILE")"
        else
            break
        fi
    done
fi

# Cleanup Strategy 4: Remove orphaned processed files
log_message "Cleaning up orphaned processed files..."

# Find processed files without corresponding input files
find "$UPLOADS_DIR" -name "processed_*.glb" | while read -r processed_file; do
    # Extract timestamp from processed file
    TIMESTAMP=$(basename "$processed_file" | sed 's/processed_\([0-9]*\)\.glb/\1/')

    # Check if any input file with similar timestamp exists (within 1 minute = 60000ms)
    FOUND_INPUT=false
    find "$UPLOADS_DIR" -name "${TIMESTAMP}_*" -o -name "$((TIMESTAMP-60000))*" -o -name "$((TIMESTAMP+60000))*" | grep -v "processed_" | head -1 | while read -r input_file; do
        if [ -n "$input_file" ]; then
            FOUND_INPUT=true
        fi
    done

    # If no input file found, it's probably orphaned
    if [ "$FOUND_INPUT" = false ]; then
        # Only remove if the file is older than 1 hour
        if [ "$(find "$processed_file" -mmin +60 -print)" ]; then
            rm -f "$processed_file"
            log_message "Removed orphaned processed file: $(basename "$processed_file")"
        fi
    fi
done

# Final statistics
FINAL_SIZE=$(get_dir_size_mb)
FINAL_COUNT=$(count_files)
SPACE_SAVED=$((INITIAL_SIZE - FINAL_SIZE))
FILES_REMOVED=$((INITIAL_COUNT - FINAL_COUNT))

log_message "Final state: ${FINAL_COUNT} files, ${FINAL_SIZE}MB"
log_message "Cleanup summary: Removed $FILES_REMOVED files, saved ${SPACE_SAVED}MB"
log_message "=== CLEANUP END ==="

# Alert if directory is still too large
if [ "$FINAL_SIZE" -gt "$MAX_SIZE_MB" ]; then
    log_message "WARNING: Directory still too large after cleanup!"
fi

exit 0