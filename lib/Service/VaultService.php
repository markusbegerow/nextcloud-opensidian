<?php

namespace OCA\Opensidian\Service;

use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\Folder;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\IUserSession;

class VaultService {
    private IRootFolder $rootFolder;
    private IUserSession $userSession;

    public function __construct(IRootFolder $rootFolder, IUserSession $userSession) {
        $this->rootFolder = $rootFolder;
        $this->userSession = $userSession;
    }

    private function getUserId(): string {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new \RuntimeException('Not authenticated');
        }
        return $user->getUID();
    }

    private function getUserFolder(): Folder {
        return $this->rootFolder->getUserFolder($this->getUserId());
    }

    /** Normalize a user-supplied path: strip leading slash, prevent traversal. */
    private function normalizePath(string $path): string {
        // Strip leading/trailing slashes, collapse double slashes
        $path = trim($path, '/');
        // Block directory traversal
        if (str_contains($path, '..')) {
            throw new \InvalidArgumentException('Invalid path');
        }
        return $path;
    }

    /**
     * Recursively list all files in a vault path.
     * Returns a flat array of file metadata objects.
     */
    public function listFiles(string $vaultPath): array {
        $vaultPath = $this->normalizePath($vaultPath);
        $userFolder = $this->getUserFolder();

        // Auto-create the vault folder on first use
        if (!$userFolder->nodeExists($vaultPath)) {
            $userFolder->newFolder($vaultPath);
            return [];
        }

        $node = $userFolder->get($vaultPath);
        if (!($node instanceof Folder)) {
            throw new \RuntimeException("Vault path is not a directory: $vaultPath");
        }

        $result = [];
        $this->walkFolder($node, $vaultPath, $vaultPath, $result);
        return $result;
    }

    private function walkFolder(Folder $folder, string $vaultRoot, string $currentPath, array &$result): void {
        foreach ($folder->getDirectoryListing() as $node) {
            $relativePath = $currentPath . '/' . $node->getName();
            $isDir = $node instanceof Folder;
            $name = $node->getName();
            $ext = $isDir ? '' : pathinfo($name, PATHINFO_EXTENSION);

            $result[] = [
                'path'      => $relativePath,
                'name'      => $name,
                'extension' => $ext,
                'is_dir'    => $isDir,
                'parent'    => $currentPath,
                // Lets the client re-read only files that changed since the last poll.
                'mtime'     => $node->getMTime(),
            ];

            if ($isDir) {
                $this->walkFolder($node, $vaultRoot, $relativePath, $result);
            }
        }
    }

    public function readFile(string $path): string {
        $path = $this->normalizePath($path);
        $userFolder = $this->getUserFolder();
        // get() throws NotFoundException if path doesn't exist — controller maps it to 404
        $node = $userFolder->get($path);
        if (!($node instanceof File)) {
            throw new \InvalidArgumentException("Not a file: $path");
        }
        return $node->getContent();
    }

    public function writeFile(string $path, string $content): void {
        $path = $this->normalizePath($path);
        $userFolder = $this->getUserFolder();

        if ($userFolder->nodeExists($path)) {
            $node = $userFolder->get($path);
            if (!($node instanceof File)) {
                throw new \InvalidArgumentException("Path is a directory: $path");
            }
            $node->putContent($content);
        } else {
            // Create parent directories if needed
            $parentPath = dirname($path);
            if ($parentPath !== '.' && $parentPath !== '') {
                $this->ensureDirectory($parentPath);
            }
            $userFolder->newFile($path, $content);
        }
    }

    public function createFile(string $path): void {
        $this->writeFile($path, '');
    }

    public function deleteFile(string $path): void {
        $path = $this->normalizePath($path);
        $userFolder = $this->getUserFolder();
        if ($userFolder->nodeExists($path)) {
            $userFolder->get($path)->delete();
        }
    }

    /**
     * Rename or move a node. $newPath is the full target path (relative to user home).
     */
    public function renameFile(string $path, string $newPath): void {
        $path = $this->normalizePath($path);
        $newPath = $this->normalizePath($newPath);
        $userFolder = $this->getUserFolder();

        // Backend guard: prevent moving a directory into one of its own subdirectories
        if (str_starts_with(rtrim($newPath, '/') . '/', rtrim($path, '/') . '/')) {
            throw new \InvalidArgumentException('Cannot move a directory into one of its subdirectories');
        }

        $node = $userFolder->get($path);
        // Ensure target parent directory exists (recursively)
        $parentPath = dirname($newPath);
        if ($parentPath !== '.' && $parentPath !== '') {
            $this->ensureDirectory($parentPath);
        }
        $node->move($userFolder->getPath() . '/' . $newPath);
    }

    public function createDirectory(string $path): void {
        $path = $this->normalizePath($path);
        $this->ensureDirectory($path);
    }

    private function ensureDirectory(string $path): void {
        $userFolder = $this->getUserFolder();
        if ($userFolder->nodeExists($path)) {
            return;
        }
        // Recursively ensure parent exists before creating this directory
        $parent = dirname($path);
        if ($parent !== '.' && $parent !== '' && $parent !== $path) {
            $this->ensureDirectory($parent);
        }
        if (!$userFolder->nodeExists($path)) {
            $userFolder->newFolder($path);
        }
    }
}
