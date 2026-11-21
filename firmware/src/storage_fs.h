#pragma once
#include "kvstore.h"

// LittleFS-backed FileStore. Call storageBegin() once in setup().
bool storageBegin();
core::FileStore& fileStore();
