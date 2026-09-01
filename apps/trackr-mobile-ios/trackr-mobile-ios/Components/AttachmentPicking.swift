//
//  AttachmentPicking.swift
//  trackr-mobile-ios
//
//  Shared picker plumbing for attachment uploads: the system camera wrapped
//  for SwiftUI, plus a modifier that hosts the photo / file / camera pickers
//  and funnels every pick into PickedFiles.
//

import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// UIImagePickerController in camera mode → one JPEG PickedFile.
/// Needs NSCameraUsageDescription in Info.plist.
struct AttachmentCameraView: UIViewControllerRepresentable {
    @Environment(\.dismiss) private var dismiss
    let onCapture: (PickedFile) -> Void

    /// False on the simulator and camera-less devices — callers hide the
    /// source rather than presenting a picker that can't open.
    static var isAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let controller = UIImagePickerController()
        controller.sourceType = .camera
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: AttachmentCameraView
        init(_ parent: AttachmentCameraView) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage,
               let file = PickedFile.load(image: image, index: 0)
            {
                parent.onCapture(file)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

/// Hosts the attachment sources behind presentation bindings; attach once
/// per screen. Batches cap at AttachmentRules.maxFilesPerBatch — oversize
/// files still come through so callers can reject them with a message.
struct AttachmentPickerHost: ViewModifier {
    @Binding var showingPhotos: Bool
    @Binding var showingFiles: Bool
    var showingCamera: Binding<Bool>?
    let onPick: ([PickedFile]) -> Void

    @State private var photoItems: [PhotosPickerItem] = []

    func body(content: Content) -> some View {
        content
            .photosPicker(
                isPresented: $showingPhotos,
                selection: $photoItems,
                maxSelectionCount: AttachmentRules.maxFilesPerBatch
            )
            .onChange(of: photoItems) { _, items in
                guard !items.isEmpty else { return }
                photoItems = []
                Task {
                    var files: [PickedFile] = []
                    for item in items {
                        if let file = await PickedFile.load(item: item) {
                            files.append(file)
                        }
                    }
                    onPick(files)
                }
            }
            .fileImporter(
                isPresented: $showingFiles,
                allowedContentTypes: [.item],
                allowsMultipleSelection: true
            ) { result in
                guard case .success(let urls) = result else { return }
                onPick(
                    urls.prefix(AttachmentRules.maxFilesPerBatch)
                        .compactMap { PickedFile.load(url: $0) }
                )
            }
            .fullScreenCover(isPresented: showingCamera ?? .constant(false)) {
                AttachmentCameraView { onPick([$0]) }
                    .ignoresSafeArea()
            }
    }
}

extension View {
    /// `camera` nil hides that source (e.g. the create sheet offers only
    /// photos + files).
    func attachmentPickers(
        photos: Binding<Bool>,
        files: Binding<Bool>,
        camera: Binding<Bool>? = nil,
        onPick: @escaping ([PickedFile]) -> Void
    ) -> some View {
        modifier(AttachmentPickerHost(
            showingPhotos: photos,
            showingFiles: files,
            showingCamera: camera,
            onPick: onPick
        ))
    }
}

/// Form-row label for an attachment source. Buttons in a Form tint their
/// labels with the accent color; these read as plain rows instead.
struct AttachmentSourceLabel: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label {
            Text(title)
                .foregroundStyle(Color(.label))
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(Color(.secondaryLabel))
        }
    }
}
