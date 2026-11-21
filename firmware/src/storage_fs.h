#pragma once
#include "kvstore.h"

// LittleFS-backed FileStore. Call storageBegin() once in setup().
bool storageBegin();
bool storageWasFormatted();  // true if this boot had to format the file system
core::FileStore& fileStore();
