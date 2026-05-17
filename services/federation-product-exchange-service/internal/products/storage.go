package products

import (
	"context"
	"errors"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
)

// BundleStorage is the object-storage seam used by the publish/install
// flows. Production wires a filesystem-backed implementation rooted at
// $MARKETPLACE_BUNDLE_ROOT; tests use the in-memory implementation
// returned by NewMemoryBundleStorage.
//
// Keys are POSIX-style relative paths, e.g.
// "marketplace/<product_rid>/<version>.tar.gz".
type BundleStorage interface {
	Put(ctx context.Context, key string, data []byte) error
	Get(ctx context.Context, key string) ([]byte, error)
}

// ErrBundleNotFound is returned by Get when the key has no stored bytes.
var ErrBundleNotFound = errors.New("marketplace bundle not found")

// MemoryBundleStorage is an in-memory BundleStorage suitable for unit
// tests. It is safe for concurrent use.
type MemoryBundleStorage struct {
	mu    sync.RWMutex
	items map[string][]byte
}

// NewMemoryBundleStorage builds an empty in-memory storage.
func NewMemoryBundleStorage() *MemoryBundleStorage {
	return &MemoryBundleStorage{items: map[string][]byte{}}
}

// Put stores data under key, overwriting any prior value.
func (m *MemoryBundleStorage) Put(_ context.Context, key string, data []byte) error {
	if key == "" {
		return errors.New("bundle storage key is empty")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	copied := make([]byte, len(data))
	copy(copied, data)
	m.items[key] = copied
	return nil
}

// Get returns the bytes previously written by Put for key.
func (m *MemoryBundleStorage) Get(_ context.Context, key string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	data, ok := m.items[key]
	if !ok {
		return nil, ErrBundleNotFound
	}
	copied := make([]byte, len(data))
	copy(copied, data)
	return copied, nil
}

// FilesystemBundleStorage stores bundles on local disk under Root.
// Used when MARKETPLACE_BUNDLE_ROOT is set; the path-traversal guard
// here mirrors the one in libs/storage-abstraction LocalBackingFS.
type FilesystemBundleStorage struct {
	Root string
}

// NewFilesystemBundleStorage builds a filesystem storage rooted at root.
// The directory is created on the first Put.
func NewFilesystemBundleStorage(root string) *FilesystemBundleStorage {
	return &FilesystemBundleStorage{Root: root}
}

// Put writes data to {Root}/{key}, creating intermediate directories.
func (f *FilesystemBundleStorage) Put(_ context.Context, key string, data []byte) error {
	abs, err := f.localPath(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return err
	}
	return os.WriteFile(abs, data, 0o644)
}

// Get reads the bytes at {Root}/{key}.
func (f *FilesystemBundleStorage) Get(_ context.Context, key string) ([]byte, error) {
	abs, err := f.localPath(key)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrBundleNotFound
		}
		return nil, err
	}
	return data, nil
}

func (f *FilesystemBundleStorage) localPath(key string) (string, error) {
	clean := path.Clean("/" + strings.TrimSpace(key))[1:]
	if clean == "." || clean == "" || strings.HasPrefix(clean, "..") {
		return "", errors.New("invalid bundle storage key")
	}
	for _, part := range strings.Split(clean, "/") {
		if part == ".." {
			return "", errors.New("invalid bundle storage key")
		}
	}
	root := f.Root
	if root == "" {
		root = "."
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	absPath := filepath.Join(absRoot, filepath.FromSlash(clean))
	rel, err := filepath.Rel(absRoot, absPath)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New("bundle storage key escapes root")
	}
	return absPath, nil
}
